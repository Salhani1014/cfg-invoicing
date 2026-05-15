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
function renderEmployees(body) {
  body.innerHTML = '<p>Employees — Task 11.3</p>';
}
function renderAlerts(body) {
  body.innerHTML = '<p>Alerts — Task 11.5</p>';
}
