export async function dashboardScreen(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Analytics</h1>
      <div style="display:flex;gap:8px">
        ${['30d','90d','ytd','all'].map(r => `
          <button class="btn btn-ghost btn-sm range-btn ${r==='30d'?'active':''}" data-range="${r}">
            ${r==='30d'?'30 Days':r==='90d'?'90 Days':r==='ytd'?'This Year':'All Time'}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="summary-cards" id="summaryCards"></div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:600">Revenue Over Time</h3>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm period-btn active" data-period="weekly">Weekly</button>
            <button class="btn btn-ghost btn-sm period-btn" data-period="monthly">Monthly</button>
          </div>
        </div>
        <canvas id="revenueChart" height="220"></canvas>
      </div>
      <div class="card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">Lead Type Breakdown</h3>
        <canvas id="leadTypeChart" height="220"></canvas>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">Top Clients</h3>
      <canvas id="clientChart" height="160"></canvas>
    </div>
  `;

  await loadChartJs();

  let allInvoices = await window.api.db.getAllInvoices();
  let period = 'weekly';
  let range = '30d';

  function filterByRange(invoices) {
    const now = new Date();
    const cutoff = range === '30d' ? new Date(now - 30*86400000)
      : range === '90d' ? new Date(now - 90*86400000)
      : range === 'ytd' ? new Date(now.getFullYear(), 0, 1)
      : new Date(0);
    return invoices.filter(inv => new Date(inv.invoice_date) >= cutoff);
  }

  function renderSummary(invoices) {
    const totalAllTime = allInvoices.reduce((s, i) => s + i.total_amount, 0);
    const now = new Date();
    const thisMonth = allInvoices.filter(i => {
      const d = new Date(i.invoice_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const activeClients = new Set(allInvoices.map(i => i.client_id)).size;
    document.getElementById('summaryCards').innerHTML = `
      <div class="summary-card"><div class="label">All-Time Revenue</div><div class="value">${fmt(totalAllTime)}</div></div>
      <div class="summary-card"><div class="label">This Month</div><div class="value">${fmt(thisMonth.reduce((s,i)=>s+i.total_amount,0))}</div></div>
      <div class="summary-card"><div class="label">Invoices This Month</div><div class="value">${thisMonth.length}</div></div>
      <div class="summary-card"><div class="label">Active Clients</div><div class="value">${activeClients}</div></div>
    `;
  }

  let revenueChart, leadChart, clientChart;

  function renderRevenue(invoices) {
    const grouped = {};
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = period === 'weekly'
        ? `${d.getFullYear()}-W${getWeek(d)}`
        : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      grouped[key] = (grouped[key] || 0) + inv.total_amount;
    });
    const labels = Object.keys(grouped).sort();
    const values = labels.map(k => grouped[k]);

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenueChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Revenue', data: values, backgroundColor: '#c9a84c', borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#222' } },
          y: { ticks: { color: '#888', callback: v => '$'+v.toLocaleString() }, grid: { color: '#222' } }
        }
      }
    });
  }

  function renderLeadTypes(invoices) {
    const types = {};
    invoices.forEach(inv => {
      if (!inv.line_items_raw) return;
      inv.line_items_raw.split(',').forEach(raw => {
        const [type,,price,qty] = raw.split(':');
        types[type] = (types[type] || 0) + (Number(price||0) * Number(qty||0));
      });
    });
    const labels = Object.keys(types);
    const values = labels.map(k => types[k]);

    if (leadChart) leadChart.destroy();
    leadChart = new Chart(document.getElementById('leadTypeChart'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: ['#c9a84c', '#e4c47a', '#a07830'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#888', font: { size: 11 } } } }
      }
    });
  }

  function renderTopClients(invoices) {
    const byClient = {};
    invoices.forEach(inv => {
      const name = `${inv.first_name} ${inv.last_name}`;
      byClient[name] = (byClient[name] || 0) + inv.total_amount;
    });
    const sorted = Object.entries(byClient).sort((a,b) => b[1]-a[1]).slice(0, 8);

    if (clientChart) clientChart.destroy();
    clientChart = new Chart(document.getElementById('clientChart'), {
      type: 'bar',
      data: {
        labels: sorted.map(([n]) => n),
        datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: '#c9a84c', borderRadius: 4 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888', callback: v => '$'+v.toLocaleString() }, grid: { color: '#222' } },
          y: { ticks: { color: '#888' }, grid: { display: false } }
        }
      }
    });
  }

  function getWeek(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  }

  function fmt(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function refresh() {
    const filtered = filterByRange(allInvoices);
    renderSummary(filtered);
    renderRevenue(filtered);
    renderLeadTypes(filtered);
    renderTopClients(filtered);
  }

  const style = document.createElement('style');
  style.textContent = '.range-btn.active, .period-btn.active { background: var(--gold-dim); color: var(--gold); border-color: var(--gold); }';
  document.head.appendChild(style);

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      range = btn.dataset.range;
      refresh();
    });
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      period = btn.dataset.period;
      renderRevenue(filterByRange(allInvoices));
    });
  });

  refresh();
}

function loadChartJs() {
  return new Promise((resolve, reject) => {
    if (window.Chart) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
