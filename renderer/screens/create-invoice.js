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

export async function createInvoiceScreen(container, params = {}) {
  const clients = await window.api.db.getClients();
  const today = new Date().toISOString().split('T')[0];
  let invoiceType = 'lead';

  function buildHtml() {
    return `
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
          <div class="form-group" style="margin-top:4px;margin-bottom:0">
            <label class="form-label">Invoice Type</label>
            <select class="form-select" id="invoiceTypeSelect">
              <option value="lead" ${invoiceType === 'lead' ? 'selected' : ''}>Lead Invoice (Trucker IUL, Spanish IUL, Widow/Vet)</option>
              <option value="custom" ${invoiceType === 'custom' ? 'selected' : ''}>Custom Invoice — free-form line items</option>
            </select>
          </div>
        </div>

        <div class="card" style="margin-bottom:20px" id="lineItemsCard">
          ${renderLineItemsSection()}
        </div>

        <div class="card" style="margin-bottom:20px">
          <h3 style="font-size:15px;font-weight:600;margin-bottom:14px;color:var(--gold)">Payment Method</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            ${PAYMENT_METHODS.map((pm, i) => `
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:10px 16px;border:1px solid var(--border);border-radius:6px;transition:all 0.15s" class="pm-option" id="pmOption${i}">
                <input type="radio" name="paymentMethod" value="${pm.key}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--gold)">
                <span style="font-size:14px;font-weight:500">${pm.label}</span>
              </label>
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
  }

  function renderLineItemsSection() {
    if (invoiceType === 'lead') {
      return `
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
                  <label class="form-label">Amount ($)</label>
                  <input type="number" class="form-input amount-input" min="0" step="0.01" placeholder="e.g. 500.00">
                </div>
                <div class="form-group" style="margin:0">
                  <label class="form-label">Guar. Min (optional)</label>
                  <input type="number" class="form-input gmin-input" min="0" placeholder="e.g. 30">
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      return `
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px;color:var(--gold)">Line Items</h3>
        <div id="customLineItems">
          ${renderCustomRow(0)}
        </div>
        <button class="btn btn-ghost btn-sm" id="addLineItemBtn" style="margin-top:12px">+ Add Line Item</button>
      `;
    }
  }

  function renderCustomRow(index) {
    return `
      <div class="custom-row" id="customRow${index}" style="display:flex;gap:10px;align-items:flex-end;margin-bottom:12px">
        <div class="form-group" style="flex:2;margin:0">
          <label class="form-label">Description</label>
          <input type="text" class="form-input custom-desc" placeholder="e.g. Consulting fee, Setup fee..." style="width:100%">
        </div>
        <div class="form-group" style="flex:1;margin:0">
          <label class="form-label">Amount ($)</label>
          <input type="number" class="form-input custom-amount" min="0" step="0.01" placeholder="0.00">
        </div>
        <button class="btn btn-danger btn-sm remove-row-btn" data-index="${index}" style="margin-bottom:1px;flex-shrink:0" ${index === 0 ? 'disabled' : ''}>×</button>
      </div>
    `;
  }

  let customRowCount = 1;

  function mount() {
    container.innerHTML = buildHtml();
    wireEvents();
    updatePreview();
  }

  function wireEvents() {
    container.querySelector('#backBtn').addEventListener('click', () => window.navigate('clients'));

    container.querySelector('#invoiceTypeSelect').addEventListener('change', e => {
      invoiceType = e.target.value;
      container.querySelector('#lineItemsCard').innerHTML = renderLineItemsSection();
      customRowCount = 1;
      wireLead();
      wireCustom();
      updateTotal();
    });

    wireLead();
    wireCustom();

    container.querySelectorAll('.amount-input, .custom-amount').forEach(inp => {
      inp.addEventListener('input', updateTotal);
    });

    container.querySelectorAll('input[name=paymentMethod]').forEach((radio, i) => {
      radio.addEventListener('change', () => {
        container.querySelectorAll('.pm-option').forEach((opt, j) => {
          opt.style.borderColor = j === i ? 'var(--gold)' : 'var(--border)';
          opt.style.background = j === i ? 'var(--gold-dim)' : '';
        });
      });
      if (radio.checked) {
        container.querySelector(`#pmOption${i}`).style.borderColor = 'var(--gold)';
        container.querySelector(`#pmOption${i}`).style.background = 'var(--gold-dim)';
      }
    });

    container.querySelector('#clientSelect').addEventListener('change', async () => {
      updatePreview();
      const clientId = Number(container.querySelector('#clientSelect').value);
      if (!clientId) return;
      try {
        const last = await window.api.db.getLastClientInvoice(clientId);
        if (last && last.lineItems.length) populateFromLastInvoice(last);
      } catch (_) {}
    });

    container.querySelector('#invoiceDate').addEventListener('change', updatePreview);

    container.querySelector('#generateSendBtn').addEventListener('click', () => generate(true));
    container.querySelector('#generateOnlyBtn').addEventListener('click', () => generate(false));
  }

  function wireLead() {
    container.querySelectorAll('.lead-check').forEach((cb, i) => {
      cb.addEventListener('change', () => {
        const item = container.querySelector(`#checkItem${i}`);
        const fields = container.querySelector(`#fields${i}`);
        item.classList.toggle('checked', cb.checked);
        fields.classList.toggle('visible', cb.checked);
        updateTotal();
      });
    });
    container.querySelectorAll('.amount-input').forEach(inp => inp.addEventListener('input', updateTotal));
  }

  function wireCustom() {
    const addBtn = container.querySelector('#addLineItemBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', () => {
      const wrapper = container.querySelector('#customLineItems');
      const div = document.createElement('div');
      div.innerHTML = renderCustomRow(customRowCount++);
      wrapper.appendChild(div.firstElementChild);
      wireRemoveButtons();
      container.querySelectorAll('.custom-amount').forEach(inp => inp.addEventListener('input', updateTotal));
    });

    wireRemoveButtons();
    container.querySelectorAll('.custom-amount').forEach(inp => inp.addEventListener('input', updateTotal));
  }

  function wireRemoveButtons() {
    container.querySelectorAll('.remove-row-btn').forEach(btn => {
      btn.onclick = () => {
        const rows = container.querySelectorAll('.custom-row');
        if (rows.length <= 1) return;
        btn.closest('.custom-row').remove();
        updateTotal();
      };
    });
  }

  function updateTotal() {
    const total = getLineItems().reduce((sum, item) => sum + item.unitPrice, 0);
    container.querySelector('#invoiceTotal').textContent = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getLineItems() {
    if (invoiceType === 'custom') {
      const items = [];
      container.querySelectorAll('.custom-row').forEach(row => {
        const desc = row.querySelector('.custom-desc').value.trim();
        const amount = Number(row.querySelector('.custom-amount').value) || 0;
        if (desc || amount) {
          items.push({ leadType: desc, quantity: 1, unitPrice: amount, guaranteedMinimum: null });
        }
      });
      return items;
    }
    const items = [];
    container.querySelectorAll('.lead-check').forEach((cb, i) => {
      if (!cb.checked) return;
      const fields = container.querySelector(`#fields${i}`);
      const amount = Number(fields.querySelector('.amount-input').value) || 0;
      const gmin = fields.querySelector('.gmin-input').value;
      items.push({ leadType: cb.value, quantity: 1, unitPrice: amount, guaranteedMinimum: gmin ? Number(gmin) : null });
    });
    return items;
  }

  function updatePreview() {
    const clientId = Number(container.querySelector('#clientSelect').value);
    const date = container.querySelector('#invoiceDate').value;
    if (!clientId || !date) { container.querySelector('#invoiceNumPreview').textContent = ''; return; }
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    const datePart = date.replace(/-/g, '');
    container.querySelector('#invoiceNumPreview').textContent = `INV-${datePart.slice(0,4)}-${datePart.slice(4,8)}-${client.last_name.toUpperCase().replace(/[^A-Z0-9]/g,'').padEnd(4,'0').slice(0,4)}${(client.first_name?.[0] ?? '').toUpperCase()}-???`;
  }

  function populateFromLastInvoice(invoice) {
    const lastType = invoice.invoice_type || 'lead';

    // Switch type if needed
    if (lastType !== invoiceType) {
      invoiceType = lastType;
      container.querySelector('#invoiceTypeSelect').value = invoiceType;
      container.querySelector('#lineItemsCard').innerHTML = renderLineItemsSection();
      customRowCount = 1;
      wireLead();
      wireCustom();
    }

    if (invoiceType === 'lead') {
      const checks = [...container.querySelectorAll('.lead-check')];
      checks.forEach((cb, i) => {
        cb.checked = false;
        container.querySelector(`#checkItem${i}`).classList.remove('checked');
        container.querySelector(`#fields${i}`).classList.remove('visible');
      });
      invoice.lineItems.forEach(item => {
        const cb = checks.find(c => c.value === item.leadType);
        if (!cb) return;
        const i = checks.indexOf(cb);
        cb.checked = true;
        container.querySelector(`#checkItem${i}`).classList.add('checked');
        const fields = container.querySelector(`#fields${i}`);
        fields.classList.add('visible');
        fields.querySelector('.amount-input').value = item.unitPrice;
        if (item.guaranteedMinimum != null) fields.querySelector('.gmin-input').value = item.guaranteedMinimum;
      });
    } else {
      const wrapper = container.querySelector('#customLineItems');
      wrapper.innerHTML = '';
      customRowCount = 0;
      invoice.lineItems.forEach((item, idx) => {
        const div = document.createElement('div');
        div.innerHTML = renderCustomRow(customRowCount++);
        const row = div.firstElementChild;
        row.querySelector('.custom-desc').value = item.leadType;
        row.querySelector('.custom-amount').value = item.unitPrice;
        wrapper.appendChild(row);
      });
      if (customRowCount === 0) {
        const div = document.createElement('div');
        div.innerHTML = renderCustomRow(customRowCount++);
        wrapper.appendChild(div.firstElementChild);
      }
      wireRemoveButtons();
    }

    if (invoice.payment_method) {
      const radio = container.querySelector(`input[name=paymentMethod][value="${invoice.payment_method}"]`);
      if (radio) {
        radio.checked = true;
        container.querySelectorAll('.pm-option').forEach((opt, j) => {
          opt.style.borderColor = radio.value === PAYMENT_METHODS[j]?.key ? 'var(--gold)' : 'var(--border)';
          opt.style.background = radio.value === PAYMENT_METHODS[j]?.key ? 'var(--gold-dim)' : '';
        });
      }
    }

    updateTotal();
    showToast('Pre-filled from last invoice — edit as needed.', 'success');
  }

  async function generate(sendEmail) {
    const err = container.querySelector('#generateError');
    err.style.display = 'none';

    const clientId = Number(container.querySelector('#clientSelect').value);
    if (!clientId) { err.textContent = 'Please select a client.'; err.style.display = 'block'; return; }

    const lineItems = getLineItems();
    if (!lineItems.length) { err.textContent = 'Please add at least one line item.'; err.style.display = 'block'; return; }

    if (invoiceType === 'lead') {
      for (const item of lineItems) {
        if (!item.unitPrice) { err.textContent = 'Please enter an amount for all selected lead types.'; err.style.display = 'block'; return; }
      }
    } else {
      for (const item of lineItems) {
        if (!item.leadType) { err.textContent = 'Please enter a description for all line items.'; err.style.display = 'block'; return; }
        if (!item.unitPrice) { err.textContent = 'Please enter an amount for all line items.'; err.style.display = 'block'; return; }
      }
    }

    const saveFolder = await window.api.settings.get('saveFolder');
    if (!saveFolder) { err.textContent = 'No save folder set. Please configure it in Settings first.'; err.style.display = 'block'; return; }

    const client = clients.find(c => c.id === clientId);
    const date = container.querySelector('#invoiceDate').value;
    const totalAmount = lineItems.reduce((s, i) => s + i.unitPrice, 0);
    const paymentMethod = container.querySelector('input[name=paymentMethod]:checked')?.value || 'paymentZelle';

    const sendBtn = container.querySelector('#generateSendBtn');
    const onlyBtn = container.querySelector('#generateOnlyBtn');
    sendBtn.disabled = true;
    onlyBtn.disabled = true;
    sendBtn.textContent = 'Generating...';

    try {
      await window.api.pdf.generate({ client, date, lineItems, totalAmount, saveFolder, sendEmail, paymentMethod, invoiceType });
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

  mount();

  if (params.clientId) {
    try {
      const last = await window.api.db.getLastClientInvoice(params.clientId);
      if (last && last.lineItems.length) populateFromLastInvoice(last);
    } catch (_) {}
  }
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
