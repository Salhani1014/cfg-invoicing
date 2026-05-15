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
function renderTimesheets(body) {
  body.innerHTML = '<p>Timesheets — Task 11.4</p>';
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
function renderAlerts(body) {
  body.innerHTML = '<p>Alerts — Task 11.5</p>';
}
