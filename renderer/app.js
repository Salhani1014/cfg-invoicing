const screenLoaders = {
  clients: () => import('./screens/clients.js').then(m => m.clientsScreen),
  'create-invoice': () => import('./screens/create-invoice.js').then(m => m.createInvoiceScreen),
  dashboard: () => import('./screens/dashboard.js').then(m => m.dashboardScreen),
  settings: () => import('./screens/settings.js').then(m => m.settingsScreen),
};

async function navigate(screenName, params = {}) {
  if (!screenName) return;
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
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

window.navigate = navigate;

navigate('clients');
