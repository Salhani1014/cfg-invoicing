const fs = require('fs');
const path = require('path');
const { getSupabase, setSession, clearSession } = require('./supabase');

const SESSION_FILE = 'auth-session.bin';
const REFRESH_LEAD_SEC = 60; // refresh if <60s until expiry

// ─── Pure helpers (Jest-tested) ─────────────────────────────────

/**
 * Validate the shape of a deserialized session blob.
 * Returns the session object if valid, otherwise null.
 */
function parseStoredSession(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const { access_token, refresh_token, expires_at } = obj;
  if (typeof access_token !== 'string' || !access_token) return null;
  if (typeof refresh_token !== 'string' || !refresh_token) return null;
  if (expires_at != null && typeof expires_at !== 'number') return null;
  return { access_token, refresh_token, expires_at: expires_at || null };
}

/**
 * Returns true if the session expires within `leadSec` seconds (default 60)
 * or has no expires_at. A session with no expires_at is treated as "needs refresh"
 * because we can't reason about its remaining lifetime.
 */
function isSessionExpiringSoon(session, leadSec = REFRESH_LEAD_SEC, nowSec = Math.floor(Date.now() / 1000)) {
  if (!session || !session.expires_at) return true;
  return session.expires_at - nowSec <= leadSec;
}

// ─── Electron-side persistence ──────────────────────────────────

function getSessionPath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), SESSION_FILE);
  } catch (_) {
    return path.join(process.env.AUTH_SESSION_DIR || '/tmp', SESSION_FILE);
  }
}

function getSafeStorage() {
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
      return safeStorage;
    }
  } catch (_) {}
  return null;
}

function persistSessionToDisk(session) {
  if (!session) return;
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || null,
  });
  const p = getSessionPath();
  const ss = getSafeStorage();
  try {
    if (ss) {
      const enc = ss.encryptString(payload);
      fs.writeFileSync(p, enc);
    } else {
      // safeStorage not available — fall back to in-memory only.
      // Per the spec: don't write raw tokens to disk in that case.
      console.warn('[auth] safeStorage unavailable; session not persisted to disk');
    }
  } catch (e) {
    console.error('[auth] Failed to persist session:', e.message);
  }
}

function readSessionFromDisk() {
  const p = getSessionPath();
  if (!fs.existsSync(p)) return null;
  const ss = getSafeStorage();
  try {
    const buf = fs.readFileSync(p);
    if (!ss) return null; // we never write plaintext, so unreadable without keychain
    const raw = ss.decryptString(buf);
    return parseStoredSession(raw);
  } catch (e) {
    console.error('[auth] Failed to read persisted session:', e.message);
    return null;
  }
}

function deleteSessionFromDisk() {
  const p = getSessionPath();
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.error('[auth] Failed to delete persisted session:', e.message);
  }
}

// ─── Auth flow helpers ──────────────────────────────────────────

let _cachedUser = null;     // { id, email, role }
let _cachedSession = null;

async function loadCurrentEmployeeRole(userId, email) {
  if (!userId) return null;
  const client = getSupabase();
  // First try matching by auth_user_id (the canonical link). Fall back to
  // email match for users seeded before their first Supabase sign-in
  // (auth_user_id NULL until backfilled). Email is in PostgREST-unfriendly
  // characters, so we use a separate .eq() query rather than .or().
  try {
    const { data } = await client
      .from('tt_employees')
      .select('role')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (data?.role) return data.role;
  } catch (_) {}
  if (email) {
    try {
      const { data } = await client
        .from('tt_employees')
        .select('role')
        .eq('email', email)
        .maybeSingle();
      if (data?.role) return data.role;
    } catch (_) {}
  }
  return null;
}

/**
 * Attempt to restore a session from disk and prime the singleton client.
 * Returns { signedIn, email, role } on success, or { signedIn: false } otherwise.
 */
async function restoreSession() {
  const stored = readSessionFromDisk();
  if (!stored) return { signedIn: false };

  const session = await setSession(stored);
  if (!session) {
    // refresh token expired / invalid — clear it
    deleteSessionFromDisk();
    return { signedIn: false };
  }

  // setSession returns the (potentially refreshed) live session — persist new tokens
  persistSessionToDisk(session);
  _cachedSession = session;
  _cachedUser = session.user
    ? { id: session.user.id, email: session.user.email }
    : null;

  const role = _cachedUser
    ? await loadCurrentEmployeeRole(_cachedUser.id, _cachedUser.email)
    : null;
  if (_cachedUser) _cachedUser.role = role;

  return {
    signedIn: true,
    email: _cachedUser?.email,
    role,
  };
}

async function signInWithPassword(email, password) {
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message || 'Sign-in failed.' };
  if (!data?.session) return { ok: false, error: 'No session returned.' };

  persistSessionToDisk(data.session);
  _cachedSession = data.session;
  _cachedUser = data.user
    ? { id: data.user.id, email: data.user.email }
    : null;
  const role = _cachedUser
    ? await loadCurrentEmployeeRole(_cachedUser.id, _cachedUser.email)
    : null;
  if (_cachedUser) _cachedUser.role = role;

  return { ok: true, email: _cachedUser?.email, role };
}

async function signInWithOtp(email) {
  if (!email) return { ok: false, error: 'Email is required.' };
  const client = getSupabase();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      // Magic link is hard for desktop apps — we ask Supabase to send a
      // 6-digit OTP via email instead, which the user can paste back.
      shouldCreateUser: false,
    },
  });
  if (error) return { ok: false, error: error.message || 'Failed to send code.' };
  return { ok: true };
}

async function verifyOtp(email, token) {
  if (!email || !token) {
    return { ok: false, error: 'Email and code are required.' };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  if (error) return { ok: false, error: error.message || 'Invalid code.' };
  if (!data?.session) return { ok: false, error: 'No session returned.' };

  persistSessionToDisk(data.session);
  _cachedSession = data.session;
  _cachedUser = data.user
    ? { id: data.user.id, email: data.user.email }
    : null;
  const role = _cachedUser
    ? await loadCurrentEmployeeRole(_cachedUser.id, _cachedUser.email)
    : null;
  if (_cachedUser) _cachedUser.role = role;

  return { ok: true, email: _cachedUser?.email, role };
}

async function signOut() {
  await clearSession();
  deleteSessionFromDisk();
  _cachedSession = null;
  _cachedUser = null;
}

function getStatus() {
  return {
    signedIn: !!_cachedUser,
    email: _cachedUser?.email,
    role: _cachedUser?.role || null,
  };
}

module.exports = {
  // pure helpers (testable)
  parseStoredSession,
  isSessionExpiringSoon,
  // electron-side flow
  restoreSession,
  signInWithPassword,
  signInWithOtp,
  verifyOtp,
  signOut,
  getStatus,
};
