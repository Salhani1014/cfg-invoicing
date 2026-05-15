const SUB_TABS = ['live', 'timesheets', 'employees', 'alerts'];

export async function timeTrackingScreen(container, params) {
  const tab = params?.tab || 'live';

  // Cleanup any orphaned interval from a prior render.
  const prevInterval = container.querySelector('#tt-body')?.dataset.intervalId;
  if (prevInterval) clearInterval(Number(prevInterval));

  container.innerHTML = `
    <div class="screen time-tracking">
      <header class="screen-header">
        <h1>Time Tracking</h1>
      </header>
      <nav class="tt-subtabs">
        ${SUB_TABS.map(t => `
          <button class="tt-subtab ${t === tab ? 'active' : ''}" data-tab="${t}">
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`).join('')}
      </nav>
      <section id="tt-body" class="tt-body"></section>
    </div>
  `;

  container.querySelectorAll('.tt-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      window.navigate('time-tracking', { tab: btn.dataset.tab });
    });
  });

  const body = container.querySelector('#tt-body');
  switch (tab) {
    case 'live':       return renderLive(body);
    case 'timesheets': return renderTimesheets(body);
    case 'employees':  return renderEmployees(body);
    case 'alerts':     return renderAlerts(body);
  }
}

async function renderLive(body) {
  body.innerHTML = '<p>Loading…</p>';
  const tick = async () => {
    try {
      const rows = await window.api.timeTracking.liveStatus();
      body.innerHTML = `
        <table class="tt-live-table">
          <thead><tr>
            <th>Name</th><th>Status</th><th>Clocked in since</th><th>WiFi</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.fullName)}</td>
                <td>${r.clockedInSince ? '<span class="pill pill-green">Clocked In</span>' : '<span class="pill pill-gray">Clocked Out</span>'}</td>
                <td>${r.clockedInSince ? formatTime(r.clockedInSince) : '—'}</td>
                <td>${r.wifiConnected ? '<span class="dot dot-green"></span> Connected' : '<span class="dot dot-red"></span> Off'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      body.innerHTML = `<p class="error">Error: ${escapeHtml(String(e.message || e))}</p>`;
    }
  };
  await tick();
  const id = setInterval(tick, 5000);
  body.dataset.intervalId = id;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
async function renderTimesheets(body) {
  body.innerHTML = '<p>Loading…</p>';
  const emps = await window.api.timeTracking.listEmployees();
  if (!emps.length) { body.innerHTML = '<p class="muted">No employees yet.</p>'; return; }

  const todayIso = new Date().toISOString().slice(0, 10);
  body.innerHTML = `
    <div class="tt-ts-controls">
      <label>Employee
        <select id="tt-ts-emp">
          ${emps.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join('')}
        </select>
      </label>
      <label>Week of <input id="tt-ts-week" type="date" value="${todayIso}"></label>
      <button id="tt-ts-load" class="btn-primary">Load</button>
    </div>
    <div id="tt-ts-shifts"></div>
  `;

  const load = async () => {
    const empId = body.querySelector('#tt-ts-emp').value;
    const week = body.querySelector('#tt-ts-week').value;
    const list = body.querySelector('#tt-ts-shifts');
    list.innerHTML = '<p>Loading…</p>';
    const shifts = await window.api.timeTracking.listShifts(empId, week);
    if (!shifts.length) { list.innerHTML = '<p class="muted">No shifts this week.</p>'; return; }

    list.innerHTML = shifts.map(s => `
      <div class="tt-shift" data-shift-id="${s.id}">
        <div class="tt-shift-row">
          <div>${formatDate(s.clock_in_at)}</div>
          <div>${formatTime(s.clock_in_at)} → ${s.clock_out_at ? formatTime(s.clock_out_at) : '<em>open</em>'}</div>
          <div>${durationLabel(s.clock_in_at, s.clock_out_at)}</div>
          <div>${s.clock_in_method}${s.clock_out_method ? ` / ${s.clock_out_method}` : ''}</div>
          <div>
            <button data-action="edit">Edit</button>
            <button data-action="audit">WiFi audit</button>
          </div>
        </div>
        <div class="tt-shift-audit" hidden></div>
      </div>`).join('');

    list.querySelectorAll('.tt-shift').forEach(card => {
      const id = card.dataset.shiftId;
      const shift = shifts.find(x => x.id === id);
      card.querySelector('[data-action="edit"]').onclick = () => openEditShiftModal(shift, () => load());
      card.querySelector('[data-action="audit"]').onclick = async () => {
        const audit = card.querySelector('.tt-shift-audit');
        if (!audit.hidden) { audit.hidden = true; return; }
        audit.innerHTML = 'Loading…';
        audit.hidden = false;
        const evts = await window.api.timeTracking.listWifiEventsForShift(id);
        audit.innerHTML = `
          <ul class="tt-audit-list">
            ${evts.map(e => `<li><span class="dot ${e.event_type === 'connect' ? 'dot-green' : 'dot-red'}"></span> ${e.event_type} at ${formatTime(e.occurred_at)}</li>`).join('') || '<li class="muted">No WiFi events in this window.</li>'}
          </ul>`;
      };
    });
  };

  body.querySelector('#tt-ts-load').onclick = load;
  load();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function durationLabel(a, b) {
  if (!b) return '—';
  const ms = new Date(b) - new Date(a);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function openEditShiftModal(shift, onSaved) {
  const m = document.createElement('div');
  m.className = 'tt-modal';
  m.innerHTML = `
    <div class="tt-modal-inner">
      <h2>Edit Shift</h2>
      <label>Clock In <input name="in" type="datetime-local" value="${toLocalInput(shift.clock_in_at)}"></label>
      <label>Clock Out <input name="out" type="datetime-local" value="${shift.clock_out_at ? toLocalInput(shift.clock_out_at) : ''}"></label>
      <label>Notes <textarea name="notes" rows="3">${escapeHtml(shift.notes || '')}</textarea></label>
      <div class="tt-modal-actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="save" class="btn-primary">Save</button>
      </div>
      <p class="tt-modal-error error" hidden></p>
    </div>`;
  document.body.appendChild(m);
  const val = (n) => m.querySelector(`[name="${n}"]`).value;
  const err = m.querySelector('.tt-modal-error');
  m.querySelector('[data-action="cancel"]').onclick = () => m.remove();
  m.querySelector('[data-action="save"]').onclick = async () => {
    err.hidden = true;
    try {
      await window.api.timeTracking.editShift(shift.id, {
        clockInAt: new Date(val('in')).toISOString(),
        clockOutAt: val('out') ? new Date(val('out')).toISOString() : null,
        notes: val('notes'),
        clockOutMethod: val('out') ? 'admin_edit' : null,
      }, await getCurrentAdminId());
      m.remove(); onSaved();
    } catch (e) { err.textContent = String(e.message || e); err.hidden = false; }
  };
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin identity — derived from the auth session. The auth status object
// exposes { signedIn, email, role } but not employeeId, so we look up the
// employee record by email. Cached per render-cycle.
let _adminIdCache = null;
async function getCurrentAdminId() {
  if (_adminIdCache) return _adminIdCache;
  const status = await window.api.auth.status();
  if (!status?.signedIn || !status.email) return null;
  if (status.employeeId) {
    _adminIdCache = status.employeeId;
    return _adminIdCache;
  }
  const emps = await window.api.timeTracking.listEmployees();
  const match = emps.find(e => e.email === status.email);
  _adminIdCache = match?.id || null;
  return _adminIdCache;
}
async function renderEmployees(body) {
  body.innerHTML = '<p>Loading…</p>';
  let rows;
  try { rows = await window.api.timeTracking.listEmployees(); }
  catch (e) { body.innerHTML = `<p class="error">${escapeHtml(String(e.message || e))}</p>`; return; }

  body.innerHTML = `
    <div class="tt-emp-actions">
      <button id="tt-emp-add" class="btn-primary">+ Add Employee</button>
    </div>
    <table class="tt-emp-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Active</th><th>Device</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-id="${r.id}">
            <td>${escapeHtml(r.full_name)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td>${escapeHtml(r.phone || '')}</td>
            <td>${r.role}</td>
            <td>${r.active ? 'Yes' : 'No'}</td>
            <td>${r.device ? escapeHtml(r.device.label || r.device.mac_address) : '<span class="muted">—</span>'}</td>
            <td>
              <button data-action="toggle-active">${r.active ? 'Disable' : 'Enable'}</button>
              ${r.device ? `<button data-action="unbind">Unbind</button>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  body.querySelector('#tt-emp-add').addEventListener('click', () => openAddEmployeeModal(body));

  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-action="toggle-active"]')?.addEventListener('click', async () => {
      const row = rows.find(r => r.id === id);
      await window.api.timeTracking.updateEmployee(id, { active: !row.active });
      renderEmployees(body);
    });
    tr.querySelector('[data-action="unbind"]')?.addEventListener('click', async () => {
      if (!confirm('Unbind this employee\'s device? They will need to re-register on office WiFi.')) return;
      await window.api.timeTracking.unbindDevice(id);
      renderEmployees(body);
    });
  });
}

function openAddEmployeeModal(body) {
  const modal = document.createElement('div');
  modal.className = 'tt-modal';
  modal.innerHTML = `
    <div class="tt-modal-inner">
      <h2>Add Employee</h2>
      <label>Full name <input name="fullName" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Phone <input name="phone" placeholder="+1XXXXXXXXXX"></label>
      <label>Role
        <select name="role">
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div class="tt-modal-actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="save" class="btn-primary">Save</button>
      </div>
      <p class="tt-modal-error error" hidden></p>
    </div>`;
  document.body.appendChild(modal);
  const get = (n) => modal.querySelector(`[name="${n}"]`).value.trim();
  const errEl = modal.querySelector('.tt-modal-error');

  modal.querySelector('[data-action="cancel"]').onclick = () => modal.remove();
  modal.querySelector('[data-action="save"]').onclick = async () => {
    errEl.hidden = true;
    try {
      await window.api.timeTracking.createEmployee({
        fullName: get('fullName'), email: get('email'), phone: get('phone') || null, role: get('role'),
      });
      modal.remove();
      renderEmployees(body);
    } catch (e) {
      errEl.textContent = String(e.message || e); errEl.hidden = false;
    }
  };
}
async function renderAlerts(body) {
  body.innerHTML = '<p>Loading…</p>';
  let rows;
  try { rows = await window.api.timeTracking.listOpenMismatches(); }
  catch (e) { body.innerHTML = `<p class="error">${escapeHtml(String(e.message || e))}</p>`; return; }

  if (!rows.length) { body.innerHTML = '<p class="muted">No mismatches right now.</p>'; return; }

  body.innerHTML = `
    <table class="tt-alerts-table">
      <thead><tr>
        <th>Employee</th><th>Clocked in</th><th>Last seen on WiFi</th><th>Off for</th><th>Action</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-shift-id="${r.shiftId}">
            <td>${escapeHtml(r.employeeName)}</td>
            <td>${formatTime(r.clockInAt)}</td>
            <td>${formatTime(r.lastSeenAt)}</td>
            <td>${minutesAgo(r.lastSeenAt)} min</td>
            <td><button data-action="close" class="btn-primary">Close at last-seen</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  body.querySelectorAll('tr[data-shift-id]').forEach(tr => {
    tr.querySelector('[data-action="close"]').onclick = async () => {
      if (!confirm('Close this shift at the last WiFi-seen timestamp?')) return;
      try {
        await window.api.timeTracking.closeShiftViaAudit(tr.dataset.shiftId, await getCurrentAdminId());
        renderAlerts(body);
      } catch (e) {
        alert('Error: ' + (e.message || e));
      }
    };
  });
}

function minutesAgo(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}
