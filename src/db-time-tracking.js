const { getSupabase } = require('./supabase');

// Proxy to the singleton client; tt_* queries require an authenticated
// session (RLS gates on auth.uid() → tt_employees.role = 'admin').
const supabase = new Proxy({}, {
  get(_t, prop) {
    return getSupabase()[prop];
  },
});

// ─── Pure helpers (tested) ──────────────────────────────────────

/**
 * Given a YYYY-MM-DD date string, return the ISO bounds of the
 * Sunday-Sunday week that contains it (start inclusive, end exclusive).
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

// ─── Queries (live-tested via admin UI; RLS requires authenticated session — see open task #20) ──────

async function listEmployees() {
  const { data, error } = await supabase
    .from('tt_employees')
    .select('id, full_name, email, phone, role, active, created_at')
    .order('full_name');
  if (error) throw error;

  const ids = (data || []).map((e) => e.id);
  if (ids.length === 0) return [];
  const { data: devs } = await supabase
    .from('tt_devices')
    .select('employee_id, mac_address, label, bound_at')
    .in('employee_id', ids)
    .is('unbound_at', null);
  const devMap = new Map((devs || []).map((d) => [d.employee_id, d]));

  return data.map((e) => ({ ...e, device: devMap.get(e.id) || null }));
}

async function createEmployee({ fullName, email, phone, role }) {
  const { data, error } = await supabase
    .from('tt_employees')
    .insert({ full_name: fullName, email, phone, role: role || 'employee' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function updateEmployee(id, patch) {
  const map = {
    full_name: patch.fullName,
    email: patch.email,
    phone: patch.phone,
    role: patch.role,
    active: patch.active,
  };
  const clean = Object.fromEntries(
    Object.entries(map).filter(([, v]) => v !== undefined)
  );
  const { error } = await supabase.from('tt_employees').update(clean).eq('id', id);
  if (error) throw error;
}

async function unbindDevice(employeeId) {
  const { error } = await supabase
    .from('tt_devices')
    .update({ unbound_at: new Date().toISOString() })
    .eq('employee_id', employeeId)
    .is('unbound_at', null);
  if (error) throw error;
}

async function listShifts(employeeId, weekStartIsoDate) {
  const { startIso, endIso } = weekBounds(weekStartIsoDate);
  const { data, error } = await supabase
    .from('tt_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('clock_in_at', startIso)
    .lt('clock_in_at', endIso)
    .order('clock_in_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function listWifiEventsForShift(shiftId) {
  const { data: shift, error: se } = await supabase
    .from('tt_shifts')
    .select('employee_id, clock_in_at, clock_out_at')
    .eq('id', shiftId)
    .single();
  if (se) throw se;
  const from = shift.clock_in_at;
  const to = shift.clock_out_at || new Date().toISOString();
  const { data, error } = await supabase
    .from('tt_wifi_events')
    .select('id, event_type, occurred_at')
    .eq('employee_id', shift.employee_id)
    .gte('occurred_at', from)
    .lte('occurred_at', to)
    .order('occurred_at');
  if (error) throw error;
  return data;
}

async function editShift(id, patch, adminEmployeeId) {
  const map = {
    clock_in_at: patch.clockInAt,
    clock_out_at: patch.clockOutAt,
    notes: patch.notes,
    clock_out_method: patch.clockOutMethod,
  };
  const clean = Object.fromEntries(
    Object.entries(map).filter(([, v]) => v !== undefined)
  );
  clean.edited_by = adminEmployeeId;
  clean.edited_at = new Date().toISOString();
  const { error } = await supabase.from('tt_shifts').update(clean).eq('id', id);
  if (error) throw error;
}

async function closeShiftViaAudit(shiftId, adminEmployeeId) {
  const { data: shift, error: se } = await supabase
    .from('tt_shifts')
    .select('id, employee_id')
    .eq('id', shiftId)
    .single();
  if (se) throw se;

  const { data: device } = await supabase
    .from('tt_devices')
    .select('mac_address')
    .eq('employee_id', shift.employee_id)
    .is('unbound_at', null)
    .maybeSingle();
  if (!device) throw new Error('Employee has no bound device');

  const { data: snap } = await supabase
    .from('tt_client_snapshot')
    .select('last_seen_at')
    .eq('mac_address', device.mac_address)
    .single();

  const { error } = await supabase
    .from('tt_shifts')
    .update({
      clock_out_at: snap.last_seen_at,
      clock_out_method: 'admin_audit_close',
      edited_by: adminEmployeeId,
      edited_at: new Date().toISOString(),
    })
    .eq('id', shiftId);
  if (error) throw error;
}

async function listOpenMismatches() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: open, error } = await supabase
    .from('tt_shifts')
    .select('id, employee_id, clock_in_at, tt_employees!inner(full_name)')
    .is('clock_out_at', null);
  if (error) throw error;
  if (!open.length) return [];

  const empIds = open.map((s) => s.employee_id);
  const { data: devs } = await supabase
    .from('tt_devices')
    .select('employee_id, mac_address')
    .in('employee_id', empIds)
    .is('unbound_at', null);
  const empToMac = new Map((devs || []).map((d) => [d.employee_id, d.mac_address]));
  const macs = [...new Set((devs || []).map((d) => d.mac_address))];
  if (macs.length === 0) return [];

  const { data: snaps } = await supabase
    .from('tt_client_snapshot')
    .select('*')
    .in('mac_address', macs);
  const snapByMac = new Map((snaps || []).map((s) => [s.mac_address, s]));

  return open
    .map((s) => {
      const mac = empToMac.get(s.employee_id);
      const snap = mac ? snapByMac.get(mac) : null;
      if (!snap || snap.currently_connected) return null;
      if (snap.last_seen_at > cutoff) return null;
      const emp = Array.isArray(s.tt_employees) ? s.tt_employees[0] : s.tt_employees;
      return {
        shiftId: s.id,
        employeeName: emp?.full_name || '(unknown)',
        clockInAt: s.clock_in_at,
        lastSeenAt: snap.last_seen_at,
      };
    })
    .filter(Boolean);
}

async function liveStatus() {
  const { data: emps } = await supabase
    .from('tt_employees')
    .select('id, full_name, role, active')
    .eq('active', true)
    .order('full_name');
  const empIds = (emps || []).map((e) => e.id);
  if (empIds.length === 0) return [];

  const { data: open } = await supabase
    .from('tt_shifts')
    .select('employee_id, clock_in_at')
    .in('employee_id', empIds)
    .is('clock_out_at', null);
  const openMap = new Map((open || []).map((s) => [s.employee_id, s]));

  const { data: devs } = await supabase
    .from('tt_devices')
    .select('employee_id, mac_address')
    .in('employee_id', empIds)
    .is('unbound_at', null);
  const empToMac = new Map((devs || []).map((d) => [d.employee_id, d.mac_address]));
  const macs = [...new Set((devs || []).map((d) => d.mac_address))];

  const { data: snaps } = macs.length
    ? await supabase
        .from('tt_client_snapshot')
        .select('mac_address, currently_connected')
        .in('mac_address', macs)
    : { data: [] };
  const macConnected = new Map(
    (snaps || []).map((s) => [s.mac_address, s.currently_connected])
  );

  return (emps || []).map((e) => {
    const mac = empToMac.get(e.id);
    return {
      id: e.id,
      fullName: e.full_name,
      role: e.role,
      clockedInSince: openMap.get(e.id)?.clock_in_at || null,
      wifiConnected: mac ? !!macConnected.get(mac) : false,
    };
  });
}

function subscribeLiveStatus(onChange) {
  const channel = supabase
    .channel('tt-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tt_shifts' },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tt_client_snapshot' },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

module.exports = {
  weekBounds,
  listEmployees,
  createEmployee,
  updateEmployee,
  unbindDevice,
  listShifts,
  listWifiEventsForShift,
  editShift,
  closeShiftViaAudit,
  listOpenMismatches,
  liveStatus,
  subscribeLiveStatus,
};
