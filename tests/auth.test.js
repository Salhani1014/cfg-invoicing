const { parseStoredSession, isSessionExpiringSoon } = require('../src/auth');

describe('parseStoredSession', () => {
  test('returns null for null/undefined', () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession(undefined)).toBeNull();
  });

  test('returns null for unparseable JSON string', () => {
    expect(parseStoredSession('not json {')).toBeNull();
  });

  test('returns null when access_token missing', () => {
    expect(parseStoredSession({ refresh_token: 'r' })).toBeNull();
  });

  test('returns null when refresh_token missing', () => {
    expect(parseStoredSession({ access_token: 'a' })).toBeNull();
  });

  test('returns null when tokens are empty strings', () => {
    expect(parseStoredSession({ access_token: '', refresh_token: 'r' })).toBeNull();
    expect(parseStoredSession({ access_token: 'a', refresh_token: '' })).toBeNull();
  });

  test('returns null when expires_at is wrong type', () => {
    expect(parseStoredSession({ access_token: 'a', refresh_token: 'r', expires_at: 'soon' })).toBeNull();
  });

  test('accepts a valid object', () => {
    expect(parseStoredSession({ access_token: 'a', refresh_token: 'r', expires_at: 1234 }))
      .toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 1234 });
  });

  test('accepts a valid JSON string', () => {
    const raw = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1234 });
    expect(parseStoredSession(raw))
      .toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 1234 });
  });

  test('normalizes missing expires_at to null', () => {
    expect(parseStoredSession({ access_token: 'a', refresh_token: 'r' }))
      .toEqual({ access_token: 'a', refresh_token: 'r', expires_at: null });
  });

  test('drops unknown fields', () => {
    const out = parseStoredSession({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { foo: 1 } });
    expect(out).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 1 });
    expect(out.user).toBeUndefined();
  });
});

describe('isSessionExpiringSoon', () => {
  test('null session counts as expiring', () => {
    expect(isSessionExpiringSoon(null)).toBe(true);
  });

  test('missing expires_at counts as expiring', () => {
    expect(isSessionExpiringSoon({ access_token: 'a', refresh_token: 'r', expires_at: null })).toBe(true);
  });

  test('expiring within lead window returns true', () => {
    const now = 1000;
    expect(isSessionExpiringSoon({ expires_at: 1030 }, 60, now)).toBe(true);
  });

  test('expiring well in the future returns false', () => {
    const now = 1000;
    expect(isSessionExpiringSoon({ expires_at: 5000 }, 60, now)).toBe(false);
  });

  test('exactly at lead window returns true (boundary inclusive)', () => {
    const now = 1000;
    expect(isSessionExpiringSoon({ expires_at: 1060 }, 60, now)).toBe(true);
  });

  test('already expired returns true', () => {
    const now = 1000;
    expect(isSessionExpiringSoon({ expires_at: 500 }, 60, now)).toBe(true);
  });
});
