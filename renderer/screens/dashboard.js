export async function dashboardScreen(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Analytics</h1>
      <button class="btn btn-ghost btn-sm" id="exportCsvBtn">Export CSV</button>
    </div>

    <div class="card" style="margin-bottom:20px;padding:16px 20px">
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">

        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Quick Range</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['week','month','quarter','year','all'].map(r => `
              <button class="btn btn-ghost btn-sm range-btn" data-range="${r}">
                ${r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r === 'quarter' ? 'This Quarter' : r === 'year' ? 'This Year' : 'All Time'}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="width:1px;height:36px;background:var(--border);margin:0 4px;align-self:flex-end"></div>

        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Custom Range</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="date" id="fromDate" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px">
            <span style="color:var(--text-muted);font-size:13px">to</span>
            <input type="date" id="toDate" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px">
            <button class="btn btn-primary btn-sm" id="applyRange">Apply</button>
          </div>
        </div>

        <div style="width:1px;height:36px;background:var(--border);margin:0 4px;align-self:flex-end"></div>

        <div>
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Client</div>
          <select id="clientFilter" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer;min-width:160px">
            <option value="all">All Clients</option>
          </select>
        </div>

      </div>
      <div id="rangeLabel" style="margin-top:10px;font-size:12px;color:var(--text-muted)"></div>
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
        <div style="position:relative;height:220px"><canvas id="revenueChart"></canvas></div>
      </div>
      <div class="card">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">Lead Type Breakdown</h3>
        <div style="position:relative;height:220px"><canvas id="leadTypeChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:16px">Top Clients</h3>
      <div style="position:relative;height:200px"><canvas id="clientChart"></canvas></div>
    </div>
  `;

  await loadChartJs();

  const allInvoices = await window.api.db.getAllInvoices();
  const paidInvoices = allInvoices.filter(i => i.paid);

  // Populate client dropdown
  const clients = [...new Map(paidInvoices.map(i => [i.client_id, `${i.first_name} ${i.last_name}`])).entries()];
  const clientSelect = document.getElementById('clientFilter');
  clients.sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, name]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    clientSelect.appendChild(opt);
  });

  let fromDate = null;
  let toDate = null;
  let clientFilter = 'all';
  let period = 'weekly';

  function setQuickRange(r) {
    const now = new Date();
    toDate = toDateStr(now);
    if (r === 'week') {
      const day = now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      fromDate = toDateStr(mon);
    } else if (r === 'month') {
      fromDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    } else if (r === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      fromDate = `${now.getFullYear()}-${String(q*3+1).padStart(2,'0')}-01`;
    } else if (r === 'year') {
      fromDate = `${now.getFullYear()}-01-01`;
    } else {
      fromDate = null; toDate = null;
    }
    document.getElementById('fromDate').value = fromDate || '';
    document.getElementById('toDate').value = toDate || '';
    updateRangeLabel();
  }

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function updateRangeLabel() {
    const el = document.getElementById('rangeLabel');
    if (!fromDate && !toDate) { el.textContent = 'Showing: All Time'; return; }
    const f = fromDate ? new Date(fromDate+'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const t = toDate   ? new Date(toDate  +'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'today';
    el.textContent = `Showing: ${f} → ${t}`;
  }

  function getFiltered() {
    return paidInvoices.filter(inv => {
      const d = inv.invoice_date;
      const afterFrom = !fromDate || d >= fromDate;
      const beforeTo  = !toDate   || d <= toDate;
      const matchClient = clientFilter === 'all' || String(inv.client_id) === String(clientFilter);
      return afterFrom && beforeTo && matchClient;
    });
  }

  function renderSummary(invoices) {
    const total = invoices.reduce((s, i) => s + i.total_amount, 0);
    const activeClients = new Set(invoices.map(i => i.client_id)).size;
    const avgDeal = invoices.length ? total / invoices.length : 0;
    document.getElementById('summaryCards').innerHTML = `
      <div class="summary-card"><div class="label">Revenue (Paid)</div><div class="value">${fmt(total)}</div></div>
      <div class="summary-card"><div class="label">Paid Invoices</div><div class="value">${invoices.length}</div></div>
      <div class="summary-card"><div class="label">Avg. Invoice</div><div class="value">${fmt(avgDeal)}</div></div>
      <div class="summary-card"><div class="label">Clients</div><div class="value">${activeClients}</div></div>
    `;
  }

  let revenueChart, leadChart, clientChart;

  function renderRevenue(invoices) {
    const grouped = {};
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = period === 'weekly'
        ? `${d.getFullYear()}-W${String(getWeek(d)).padStart(2,'0')}`
        : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      grouped[key] = (grouped[key] || 0) + inv.total_amount;
    });
    const labels = Object.keys(grouped).sort();
    const values = labels.map(k => grouped[k]);
    const maxVal = values.length ? Math.max(...values) : 1000;

    if (revenueChart) revenueChart.destroy();
    revenueChart = new Chart(document.getElementById('revenueChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Revenue', data: values, backgroundColor: '#c9a84c', borderRadius: 4, maxBarThickness: 56 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#222' } },
          y: {
            beginAtZero: true,
            suggestedMax: maxVal * 1.2,
            ticks: { color: '#888', callback: v => '$' + v.toLocaleString() },
            grid: { color: '#222' }
          }
        }
      }
    });
  }

  function renderLeadTypes(invoices) {
    const types = {};
    invoices.forEach(inv => {
      if (!inv.line_items_raw) return;
      inv.line_items_raw.split(',').forEach(raw => {
        const [type, qty, price] = raw.split('\x1f');
        if (!type) return;
        types[type] = (types[type] || 0) + (Number(price || 0) * Number(qty || 0));
      });
    });
    const labels = Object.keys(types);
    const values = labels.map(k => types[k]);

    if (leadChart) leadChart.destroy();
    leadChart = new Chart(document.getElementById('leadTypeChart'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: ['#c9a84c', '#4a9eff', '#e05c5c'], borderWidth: 0 }]
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
      const key = inv.client_id;
      if (!byClient[key]) byClient[key] = { name: `${inv.first_name} ${inv.last_name}`, total: 0 };
      byClient[key].total += inv.total_amount;
    });
    const sorted = Object.values(byClient).sort((a, b) => b.total - a.total).slice(0, 8).map(c => [c.name, c.total]);
    const maxVal = sorted.length ? sorted[0][1] : 1000;

    if (clientChart) clientChart.destroy();
    clientChart = new Chart(document.getElementById('clientChart'), {
      type: 'bar',
      data: {
        labels: sorted.map(([n]) => n),
        datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#c9a84c', borderRadius: 4, maxBarThickness: 32 }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: maxVal * 1.2,
            ticks: { color: '#888', callback: v => '$' + v.toLocaleString() },
            grid: { color: '#222' }
          },
          y: { ticks: { color: '#888' }, grid: { display: false } }
        }
      }
    });
  }

  function exportCsv() {
    const invoices = getFiltered();
    const rows = [
      ['Invoice #', 'Client', 'Lead Types', 'Invoice Date', 'Paid Date', 'Amount'],
      ...invoices.map(inv => [
        inv.invoice_number,
        `${inv.first_name} ${inv.last_name}`,
        inv.line_items_raw
          ? inv.line_items_raw.split(',').map(r => r.split('\x1f')[0]).join(' | ')
          : '',
        inv.invoice_date,
        inv.paid_at ? inv.paid_at.split('T')[0] : '',
        inv.total_amount.toFixed(2)
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rangeStr = fromDate ? `${fromDate}_to_${toDate || 'now'}` : 'all-time';
    a.download = `cfg-invoices-${rangeStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getWeek(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  }

  function fmt(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function refresh() {
    const filtered = getFiltered();
    renderSummary(filtered);
    renderRevenue(filtered);
    renderLeadTypes(filtered);
    renderTopClients(filtered);
    updateRangeLabel();
  }

  if (!document.getElementById('dashboard-styles')) {
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.textContent = '.range-btn.active, .period-btn.active { background: var(--gold-dim); color: var(--gold); border-color: var(--gold); }';
    document.head.appendChild(style);
  }

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setQuickRange(btn.dataset.range);
      refresh();
    });
  });

  document.getElementById('applyRange').addEventListener('click', () => {
    fromDate = document.getElementById('fromDate').value || null;
    toDate   = document.getElementById('toDate').value   || null;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    refresh();
  });

  document.getElementById('clientFilter').addEventListener('change', e => {
    clientFilter = e.target.value;
    refresh();
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      period = btn.dataset.period;
      renderRevenue(getFiltered());
    });
  });

  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

  // Default to this month
  setQuickRange('month');
  document.querySelector('.range-btn[data-range="month"]').classList.add('active');
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
