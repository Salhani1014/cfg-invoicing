const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Pure helpers (tested) ──────────────────────────────────────

/**
 * Given a YYYY-MM-DD date string, return the ISO bounds of the
 * Sunday-Sunday week that contains it (start inclusive, end exclusive).
 *
 * Used by the admin Timesheets sub-tab to bucket shifts by week.
 */
function weekBounds(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sunday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

module.exports = { weekBounds };
