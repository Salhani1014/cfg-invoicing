const REQUIRED_SCHEMA_VERSION = 1;

const screenLoaders = {
  clients:        () => import('./screens/clients.js').then(m => m.clientsScreen),
  'create-invoice': () => import('./screens/create-invoice.js').then(m => m.createInvoiceScreen),
  'batch-invoice':  () => import('./screens/bulk-invoice.js').then(m => m.batchInvoiceScreen),
  invoices:       () => import('./screens/invoices.js').then(m => m.invoicesScreen),
  contractors:    () => import('./screens/contractors.js').then(m => m.contractorsScreen),
  dashboard:      () => import('./screens/dashboard.js').then(m => m.dashboardScreen),
  settings:       () => import('./screens/settings.js').then(m => m.settingsScreen),
  setup:          () => import('./screens/setup.js').then(m => m.setupScreen),
};

async function navigate(screenName, params = {}) {
  if (!screenName) return;
  const isUtil = screenName === 'setup';
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === screenName);
  });
  const container = document.getElementById('screen-container');
  try {
    const loader = screenLoaders[screenName];
    if (!loader) throw new Error(`Unknown screen: ${screenName}`);
    const screenFn = await loader();
    await screenFn(container, params);
  } catch (err) {
    console.error(`[navigate] failed to load screen "${screenName}":`, err);
    container.innerHTML = `<div class="empty-state"><h3>${screenName}</h3><p>Screen coming soon.</p></div>`;
  }
  if (!isUtil) updateUnpaidBadge();
}

async function updateUnpaidBadge() {
  try {
    const invoices = await window.api.db.getAllInvoices();
    const unpaid = invoices.filter(i => !i.paid).length;
    const badge = document.getElementById('unpaidBadge');
    if (badge) {
      badge.textContent = unpaid;
      badge.style.display = unpaid > 0 ? 'inline-flex' : 'none';
    }
  } catch (_) {}
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

window.navigate = navigate;
window.updateUnpaidBadge = updateUnpaidBadge;

async function init() {
  const container = document.getElementById('screen-container');

  try {
    const version = await window.api.db.getSchemaVersion();
    if (version > REQUIRED_SCHEMA_VERSION) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
          <div style="text-align:center;max-width:400px">
            <h2 style="color:var(--gold);margin-bottom:12px">Update Required</h2>
            <p style="color:var(--text-muted)">A newer version of CFG Invoicing is required to connect to the database. Please download the latest version.</p>
          </div>
        </div>`;
      return;
    }
  } catch (e) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
        <div style="text-align:center;max-width:400px">
          <h2 style="color:var(--red);margin-bottom:12px">Cannot Connect</h2>
          <p style="color:var(--text-muted)">Unable to reach the database. Check your internet connection and restart the app.</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:8px">${e.message}</p>
        </div>
      </div>`;
    return;
  }

  const configured = await window.api.userConfig.isConfigured();
  if (!configured) {
    navigate('setup');
    return;
  }

  navigate('clients');
}

init();
