const LEAD_TYPES = [
  'Trucker IUL Leads',
  'Spanish IUL Leads',
  'Widow of Veteran Leads',
];

export async function createInvoiceScreen(container, params = {}) {
  const clients = await window.api.db.getClients();
  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-ghost btn-sm" id="backBtn">← Back</button>
        <h1 class="page-title">Create Invoice</h1>
      </div>
    </div>

    <div style="max-width:680px">
      <div class="card" style="margin-bottom:20px">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Client</label>
            <select class="form-select" id="clientSelect">
              <option value="">Select a client...</option>
              ${clients.map(c => `<option value="${c.id}" ${c.id === params.clientId ? 'selected' : ''}>${esc(c.first_name)} ${esc(c.last_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Invoice Date</label>
            <input type="date" class="form-input" id="invoiceDate" value="${today}">
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px;color:var(--gold)">Lead Types</h3>
        <div class="checkbox-group" id="leadTypeGroup">
          ${LEAD_TYPES.map((lt, i) => `
            <div>
              <label class="checkbox-item" id="checkItem${i}">
                <input type="checkbox" value="${lt}" class="lead-check">
                <span style="font-size:14px;font-weight:500">${lt}</span>
              </label>
              <div class="lead-fields" id="fields${i}">
                <div class="form-group" style="margin:0">
                  <label class="form-label">Quantity</label>
                  <input type="number" class="form-input qty-input" min="1" placeholder="e.g. 50">
                </div>
                <div class="form-group" style="margin:0">
                  <label class="form-label">Unit Price ($)</label>
                  <input type="number" class="form-input price-input" min="0" step="0.01" placeholder="e.g. 10.00">
                </div>
                <div class="form-group" style="margin:0">
                  <label class="form-label">Guar. Min (optional)</label>
                  <input type="number" class="form-input gmin-input" min="0" placeholder="e.g. 30">
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">INVOICE TOTAL</div>
          <div style="font-size:32px;font-weight:700;color:var(--gold)" id="invoiceTotal">$0.00</div>
        </div>
        <div id="invoiceNumPreview" style="font-size:13px;color:var(--text-muted)"></div>
      </div>

      <div id="generateError" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none"></div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="generateSendBtn">Generate &amp; Send Email</button>
        <button class="btn btn-ghost" id="generateOnlyBtn">Generate Only</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => window.navigate('clients'));

  document.querySelectorAll('.lead-check').forEach((cb, i) => {
    cb.addEventListener('change', () => {
      const item = document.getElementById(`checkItem${i}`);
      const fields = document.getElementById(`fields${i}`);
      item.classList.toggle('checked', cb.checked);
      fields.classList.toggle('visible', cb.checked);
      updateTotal();
    });
  });

  container.querySelectorAll('.qty-input, .price-input').forEach(inp => {
    inp.addEventListener('input', updateTotal);
  });

  document.getElementById('clientSelect').addEventListener('change', updatePreview);
  document.getElementById('invoiceDate').addEventListener('change', updatePreview);

  function updateTotal() {
    const total = getLineItems().reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    document.getElementById('invoiceTotal').textContent = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getLineItems() {
    const items = [];
    document.querySelectorAll('.lead-check').forEach((cb, i) => {
      if (!cb.checked) return;
      const fields = document.getElementById(`fields${i}`);
      const qty = Number(fields.querySelector('.qty-input').value) || 0;
      const price = Number(fields.querySelector('.price-input').value) || 0;
      const gmin = fields.querySelector('.gmin-input').value;
      items.push({
        leadType: cb.value,
        quantity: qty,
        unitPrice: price,
        guaranteedMinimum: gmin ? Number(gmin) : null
      });
    });
    return items;
  }

  function updatePreview() {
    const clientId = Number(document.getElementById('clientSelect').value);
    const date = document.getElementById('invoiceDate').value;
    if (!clientId || !date) { document.getElementById('invoiceNumPreview').textContent = ''; return; }
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const datePart = date.replace(/-/g, '');
    document.getElementById('invoiceNumPreview').textContent = `INV-${datePart.slice(0,4)}-${datePart.slice(4,8)}-${client.last_name.toUpperCase().replace(/[^A-Z0-9]/g,'').padEnd(4,'0').slice(0,4)}${(client.first_name?.[0] ?? '').toUpperCase()}-???`;
  }

  async function generate(sendEmail) {
    const err = document.getElementById('generateError');
    err.style.display = 'none';

    const clientId = Number(document.getElementById('clientSelect').value);
    if (!clientId) { err.textContent = 'Please select a client.'; err.style.display = 'block'; return; }

    const lineItems = getLineItems();
    if (!lineItems.length) { err.textContent = 'Please select at least one lead type.'; err.style.display = 'block'; return; }

    for (const item of lineItems) {
      if (!item.quantity || !item.unitPrice) { err.textContent = 'Please fill in quantity and unit price for all selected lead types.'; err.style.display = 'block'; return; }
    }

    const saveFolder = await window.api.settings.get('saveFolder');
    if (!saveFolder) { err.textContent = 'No save folder set. Please configure it in Settings first.'; err.style.display = 'block'; return; }

    const client = clients.find(c => c.id === clientId);
    const date = document.getElementById('invoiceDate').value;
    const totalAmount = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    const sendBtn = document.getElementById('generateSendBtn');
    const onlyBtn = document.getElementById('generateOnlyBtn');
    sendBtn.disabled = true;
    onlyBtn.disabled = true;
    sendBtn.textContent = 'Generating...';

    try {
      await window.api.pdf.generate({
        client, date, lineItems, totalAmount, saveFolder, sendEmail
      });
      showToast(sendEmail ? 'Invoice generated and emailed!' : 'Invoice generated!', 'success');
      setTimeout(() => window.navigate('clients'), 1200);
    } catch (e) {
      err.textContent = e.message || 'Failed to generate invoice.';
      err.style.display = 'block';
    } finally {
      sendBtn.disabled = false;
      onlyBtn.disabled = false;
      sendBtn.textContent = 'Generate & Send Email';
    }
  }

  document.getElementById('generateSendBtn').addEventListener('click', () => generate(true));
  document.getElementById('generateOnlyBtn').addEventListener('click', () => generate(false));

  updatePreview();
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
