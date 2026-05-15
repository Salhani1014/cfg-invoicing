const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://wbzdayezlwqslfcnvcjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiemRheWV6bHdxc2xmY252Y2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTUzNTMsImV4cCI6MjA5MjI5MTM1M30.21Ki897fXU6ObDwDV0639eqDKZ0K6gmWYSnwfzhBgQE';

// Singleton authenticated client. Built lazily so tests / non-Electron contexts
// can require this module without immediately spinning up a network client.
//
// We disable supabase-js's own session persistence: we persist via Electron
// safeStorage in src/auth.js (encrypted at rest with the OS keychain).
let _client = null;

function getSupabase() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

/**
 * Hydrate the singleton client with a previously-persisted session.
 * Returns the active session (post-refresh, if needed), or null on failure.
 */
async function setSession({ access_token, refresh_token }) {
  if (!access_token || !refresh_token) return null;
  const client = getSupabase();
  const { data, error } = await client.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) return null;
  return data.session;
}

async function clearSession() {
  const client = getSupabase();
  try { await client.auth.signOut(); } catch (_) { /* ignore */ }
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getSupabase,
  setSession,
  clearSession,
};
