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

function renderLive(body) {
  body.innerHTML = '<p>Live — Task 11.2</p>';
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
