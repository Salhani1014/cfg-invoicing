const LEAD_TYPES = [
  'Trucker IUL Leads',
  'Spanish IUL Leads',
  'Widow of Veteran Leads',
];

const PAYMENT_METHODS = [
  { key: 'paymentZelle', label: 'Zelle' },
  { key: 'paymentBank', label: 'Bank Transfer' },
  { key: 'paymentOther', label: 'Other' },
];

export async function batchInvoiceScreen(container) {
  const [clients, userCfg] = await Promise.all([
    window.api.db.getClients(),
    window.api.userConfig.getConfig()
  ]);
  const saveFolder = userCfg?.saveFolder;

  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Batch Invoice</h1>
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px">
        <label style="font-size:13px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap">Invoice Date</label>
        <input type="date" class="form-input" id="batchDate" value="${today}" style="width:180px">
      </div>
      <div style="margin-left:auto;display:flex;gap:10px">
        <button class="btn btn-ghost" id="batchGenerateBtn">Generate Only</button>
        <button class="btn btn-primary" id="batchSendBtn">Generate &amp; Send All</button>
      </div>
    </div>

    <div id="batchProgress" style="display:none;margin-bottom:16px" class="card">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px" id="progressTitle">Processing invoices...</div>
      <div id="progressItems" style="font-size:13px;color:var(--text-muted);line-height:1.8"></div>
    </div>

    <div id="clientList">
      ${clients.length === 0
        ? '<div class="empty-state"><h3>No clients yet</h3><p>Add clients first from the Clients screen.</p></div>'
        : clients.map((c, idx) => renderClientRow(c, idx)).join('')
      }
    </div>
  `;

  function getStatus(lastDate) {
    if (!lastDate) return { label: 'Overdue', cls: 'badge-red' };
    const last = new Date(lastDate); last.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const days = Math.round((now - last) / 86400000);
    if (days < 6) return { label: 'Up to Date', cls: 'badge-green' };
    if (days === 6) return { label: 'Due Soon', cls: 'badge-yellow' };
    return { label: 'Overdue', cls: 'badge-red' };
  }

  function renderClientRow(c, idx) {
    const status = getStatus(c.last_invoice_date);
    return `
      <div class="card" id="batchRow${idx}" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <input type="checkbox" id="batchCheck${idx}" style="width:18px;height:18px;accent-color:var(--gold);cursor:pointer;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <strong>${esc(c.first_name)} ${esc(c.last_name)}</strong>
            <span style="color:var(--text-muted);font-size:13px;margin-left:8px">${esc(c.email)}</span>
          </div>
          <span class="badge ${status.cls}">${status.label}</span>
        </div>
        <div id="batchFields${idx}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          <div style="margin-bottom:14px">
            ${LEAD_TYPES.map((lt, li) => `
              <div style="margin-bottom:8px">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 12px;border:1px solid var(--border);border-radius:6px;transition:border-color 0.15s" id="batchLtLabel${idx}_${li}">
                  <input type="checkbox" id="batchLt${idx}_${li}" style="accent-color:var(--gold);width:15px;height:15px;cursor:pointer">
                  <span style="font-size:14px;font-weight:500">${lt}</span>
                </label>
                <div id="batchLtFields${idx}_${li}" style="display:none;grid-template-columns:1fr 1fr;gap:12px;padding:10px 12px;background:var(--dark);border-radius:0 0 6px 6px;margin-top:-2px">
                  <div>
                    <label class="form-label">Amount ($)</label>
                    <input type="number" class="form-input" id="batchAmt${idx}_${li}" min="0" step="0.01" placeholder="e.g. 500.00">
                  </div>
                  <div>
                    <label class="form-label">Guar. Min (optional)</label>
                    <input type="number" class="form-input" id="batchGmin${idx}_${li}" min="0" placeholder="e.g. 30">
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <label style="font-size:13px;font-weight:500;color:var(--text-muted)">Payment:</label>
            <select class="form-select" id="batchPm${idx}" style="width:180px">
              ${PAYMENT_METHODS.map(pm => `<option value="${pm.key}">${pm.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  // Wire up client checkboxes
  clients.forEach((c, idx) => {
    const check = document.getElementById(`batchCheck${idx}`);
    const fields = document.getElementById(`batchFields${idx}`);

    check.addEventListener('change', () => {
      fields.style.display = check.checked ? 'block' : 'none';
    });

    // Wire up lead type checkboxes
    LEAD_TYPES.forEach((lt, li) => {
      const ltCheck = document.getElementById(`batchLt${idx}_${li}`);
      const ltFields = document.getElementById(`batchLtFields${idx}_${li}`);
      const ltLabel = document.getElementById(`batchLtLabel${idx}_${li}`);

      ltCheck.addEventListener('change', () => {
        ltFields.style.display = ltCheck.checked ? 'grid' : 'none';
        ltLabel.style.borderColor = ltCheck.checked ? 'var(--gold)' : 'var(--border)';
        ltLabel.style.background = ltCheck.checked ? 'var(--gold-dim)' : '';
      });
    });
  });

  function getCheckedInvoices() {
    const date = document.getElementById('batchDate').value;
    const invoices = [];

    clients.forEach((c, idx) => {
      const check = document.getElementById(`batchCheck${idx}`);
      if (!check.checked) return;

      const lineItems = [];
      LEAD_TYPES.forEach((lt, li) => {
        const ltCheck = document.getElementById(`batchLt${idx}_${li}`);
        if (!ltCheck.checked) return;
        const amount = Number(document.getElementById(`batchAmt${idx}_${li}`).value) || 0;
        const gmin = document.getElementById(`batchGmin${idx}_${li}`).value;
        lineItems.push({
          leadType: lt,
          quantity: 1,
          unitPrice: amount,
          guaranteedMinimum: gmin ? Number(gmin) : null
        });
      });

      const paymentMethod = document.getElementById(`batchPm${idx}`).value;
      invoices.push({ client: c, date, lineItems, paymentMethod });
    });

    return invoices;
  }

  async function runBatch(sendEmail) {
    if (!saveFolder) {
      showToast('Save folder not configured. Go to Settings to set it up.', 'error');
      return;
    }

    const invoices = getCheckedInvoices();
    if (!invoices.length) {
      showToast('No clients checked.', 'error');
      return;
    }

    for (const inv of invoices) {
      if (!inv.lineItems.length) {
        showToast(`${inv.client.first_name} ${inv.client.last_name} has no lead types selected.`, 'error');
        return;
      }
      for (const item of inv.lineItems) {
        if (!item.unitPrice) {
          showToast(`${inv.client.first_name} ${inv.client.last_name}: enter an amount for all selected lead types.`, 'error');
          return;
        }
      }
    }

    const sendBtn = document.getElementById('batchSendBtn');
    const genBtn = document.getElementById('batchGenerateBtn');
    sendBtn.disabled = true;
    genBtn.disabled = true;

    const progress = document.getElementById('batchProgress');
    const progressTitle = document.getElementById('progressTitle');
    const progressItems = document.getElementById('progressItems');
    progress.style.display = 'block';
    progressItems.innerHTML = '';

    let done = 0;
    const results = [];

    for (const inv of invoices) {
      const name = `${inv.client.first_name} ${inv.client.last_name}`;
      progressTitle.textContent = `Processing ${done + 1} of ${invoices.length}...`;

      try {
        const totalAmount = inv.lineItems.reduce((s, i) => s + i.unitPrice, 0);
        await window.api.pdf.generate({
          client: inv.client,
          date: inv.date,
          lineItems: inv.lineItems,
          totalAmount,
          saveFolder,
          sendEmail,
          paymentMethod: inv.paymentMethod
        });
        done++;
        results.push({ name, ok: true });
        progressItems.innerHTML = results.map(r =>
          `<div>${r.ok ? '✓' : '✗'} ${esc(r.name)}</div>`
        ).join('');
      } catch (err) {
        results.push({ name, ok: false, err: err.message });
        progressItems.innerHTML = results.map(r =>
          `<div style="color:${r.ok?'inherit':'var(--red)'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.err ? ' — ' + esc(r.err) : ''}</div>`
        ).join('');
      }
    }

    const failed = results.filter(r => !r.ok).length;
    progressTitle.textContent = failed
      ? `Done — ${done} succeeded, ${failed} failed`
      : `Done — ${done} invoice${done !== 1 ? 's' : ''} ${sendEmail ? 'generated and sent' : 'generated'}`;

    sendBtn.disabled = false;
    genBtn.disabled = false;
  }

  document.getElementById('batchSendBtn').addEventListener('click', () => runBatch(true));
  document.getElementById('batchGenerateBtn').addEventListener('click', () => runBatch(false));
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
