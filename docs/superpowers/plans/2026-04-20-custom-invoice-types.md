# Custom Invoice Types + Inline Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a type selector to the Create Invoice screen (Lead vs Custom free-form), store the type on the invoice record, update the PDF template to use "Description" header for custom invoices, and display notes inline below their invoice row on the Invoices screen.

**Architecture:** Four sequential tasks — DB migration first, then pdf-generator, then the two renderer screens. The invoice type flows from the UI dropdown → `pdf:generate` IPC payload → `createInvoice` DB call → template render. Notes are already stored; this only changes how they're displayed.

**Tech Stack:** Electron 28, better-sqlite3, vanilla JS/HTML/CSS, existing hidden-BrowserWindow PDF pattern.

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `src/db.js` | Modify | Add `invoice_type` column migration; update `createInvoice` INSERT |
| `src/pdf-generator.js` | Modify | Pass `invoiceType` to `createInvoice` and template payload |
| `renderer/invoice-template/template.html` | Modify | Conditional column header: "Lead Type" vs "Description" |
| `renderer/screens/create-invoice.js` | Modify | Type selector dropdown; custom line items UI; auto-populate handles custom type |
| `renderer/screens/invoices.js` | Modify | Inline note row below invoice row; custom type filter option |

---

## Task 1: DB Migration + createInvoice Update

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Add `invoice_type` to the migration block**

In `src/db.js`, find the safe column additions block (around line 62) and add one line:

```javascript
  // Safe column additions — no-op if already present
  const cols = db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name);
  if (!cols.includes('paid'))              db.exec('ALTER TABLE invoices ADD COLUMN paid INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('paid_at'))           db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT');
  if (!cols.includes('payment_method'))    db.exec('ALTER TABLE invoices ADD COLUMN payment_method TEXT');
  if (!cols.includes('reminder_sent_at'))  db.exec('ALTER TABLE invoices ADD COLUMN reminder_sent_at TEXT');
  if (!cols.includes('notes'))             db.exec('ALTER TABLE invoices ADD COLUMN notes TEXT');
  if (!cols.includes('invoice_type'))      db.exec("ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'lead'");
```

- [ ] **Step 2: Update `createInvoice` to store `invoice_type`**

Replace the existing `createInvoice` function (lines 110–129):

```javascript
function createInvoice(data) {
  const db = getDb();
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (client_id, invoice_number, invoice_date, total_amount, payment_method, invoice_type) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertLineItem = db.prepare(
    'INSERT INTO invoice_line_items (invoice_id, lead_type, quantity, unit_price, guaranteed_minimum) VALUES (?, ?, ?, ?, ?)'
  );

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(
      data.clientId, data.invoiceNumber, data.invoiceDate, data.totalAmount,
      data.paymentMethod || null, data.invoiceType || 'lead'
    );
    const invoiceId = result.lastInsertRowid;
    for (const item of data.lineItems) {
      insertLineItem.run(invoiceId, item.leadType, item.quantity, item.unitPrice, item.guaranteedMinimum || null);
    }
    return invoiceId;
  })();

  return invoiceId;
}
```

- [ ] **Step 3: Start the app and verify no crash**

```bash
npm start
```

Expected: app opens normally, no error in terminal. The migration adds the column silently.

- [ ] **Step 4: Commit**

```bash
git add src/db.js
git commit -m "feat: add invoice_type column, pass to createInvoice"
```

---

## Task 2: PDF Generator — Pass invoiceType

**Files:**
- Modify: `src/pdf-generator.js`

- [ ] **Step 1: Add `invoiceType` to `createInvoice` call and template payload in `generateInvoicePDF`**

Replace the `db.createInvoice` call and the `payload` line inside `generateInvoicePDF` (lines 13–20 and 43):

```javascript
  const invoiceId = db.createInvoice({
    clientId: client.id,
    invoiceNumber,
    invoiceDate: date,
    totalAmount,
    lineItems,
    paymentMethod: data.paymentMethod || 'paymentZelle',
    invoiceType: data.invoiceType || 'lead'
  });
```

And update the payload line (line 43):

```javascript
    const payload = JSON.stringify({ client, date, lineItems, totalAmount, invoiceNumber, settings, logoBase64, paymentMethod: data.paymentMethod || 'paymentZelle', paid: false, invoiceType: data.invoiceType || 'lead' });
```

- [ ] **Step 2: Add `invoiceType` to `generatePaidPDF` template payload**

In `generatePaidPDF`, the paid PDF re-reads the invoice from DB. The `invoice` object now has `invoice_type` (via `i.*` in `getInvoiceById`). Update the payload (line 95):

```javascript
    const payload = JSON.stringify({
      client,
      date: invoice.invoice_date,
      lineItems: invoice.lineItems,
      totalAmount: invoice.total_amount,
      invoiceNumber: invoice.invoice_number,
      settings,
      logoBase64,
      paymentMethod: invoice.payment_method || 'paymentZelle',
      paid: true,
      invoiceType: invoice.invoice_type || 'lead'
    });
```

- [ ] **Step 3: Commit**

```bash
git add src/pdf-generator.js
git commit -m "feat: pass invoiceType through PDF generator to template"
```

---

## Task 3: Invoice Template — Conditional Column Header

**Files:**
- Modify: `renderer/invoice-template/template.html`

- [ ] **Step 1: Add conditional header logic in `renderInvoice`**

In `template.html`, inside the `renderInvoice` function, add one line immediately before the `document.getElementById('invoicePage').innerHTML` assignment:

```javascript
      const lineItemHeader = data.invoiceType === 'custom' ? 'Description' : 'Lead Type';
```

- [ ] **Step 2: Use `lineItemHeader` in the table header**

Find the `<th>Lead Type</th>` inside the items table header and replace it:

```javascript
              <th>${lineItemHeader}</th>
              <th style="text-align:right">Amount</th>
```

- [ ] **Step 3: Start the app, generate a lead invoice, verify "Lead Type" still appears on the PDF**

Generate any invoice from the existing flow. Open the saved PDF. The column header should read "Lead Type" — unchanged from before.

- [ ] **Step 4: Commit**

```bash
git add renderer/invoice-template/template.html
git commit -m "feat: conditional Lead Type/Description column header in PDF template"
```

---

## Task 4: Create Invoice Screen — Type Selector + Custom Line Items

**Files:**
- Modify: `renderer/screens/create-invoice.js`

- [ ] **Step 1: Replace the entire file with the updated version**

```javascript
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
```

- [ ] **Step 2: Start the app and verify Lead Invoice mode works exactly as before**

- Navigate to any client → New Invoice
- Confirm the "Invoice Type" dropdown appears below the client/date fields
- Confirm Lead Invoice is selected by default
- Check Trucker IUL Leads, enter an amount, click Generate Only
- Verify the PDF saves and the column header reads "Lead Type"

- [ ] **Step 3: Verify Custom Invoice mode**

- Switch the type dropdown to "Custom Invoice"
- Confirm the checkboxes disappear and a "Description / Amount" row appears
- Add a second line item via "+ Add Line Item"
- Fill in descriptions and amounts
- Click Generate Only
- Verify the PDF saves and the column header reads "Description"

- [ ] **Step 4: Verify auto-populate switches type correctly**

- Select a client that has a prior lead invoice → confirm lead checkboxes pre-fill
- If you generated a custom invoice in Step 3: select that client → confirm the type selector switches to "Custom Invoice" and the custom rows pre-fill

- [ ] **Step 5: Commit**

```bash
git add renderer/screens/create-invoice.js
git commit -m "feat: invoice type selector, custom free-form line items, auto-populate handles both types"
```

---

## Task 5: Invoices Screen — Inline Notes + Custom Type Filter

**Files:**
- Modify: `renderer/screens/invoices.js`

- [ ] **Step 1: Update `renderRow` to return a note sub-row when notes exist**

Find the `renderRow` function. Replace its `return` statement so it concatenates a second `<tr>` when `inv.notes` is non-empty:

```javascript
  function renderRow(inv) {
    const isPaid = !!inv.paid;
    const isSelected = selectedIds.has(inv.id);
    const hasReminder = !!inv.reminder_sent_at;
    const hasNote = !!(inv.notes && inv.notes.trim());

    const statusBadge = isPaid
      ? `<span class="badge badge-green">Paid</span><div style="font-size:11px;color:var(--text-muted);margin-top:3px">${formatDate(inv.paid_at)}</div>`
      : `<span class="badge badge-red">Unpaid</span>${hasReminder ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Reminded ${formatDate(inv.reminder_sent_at)}</div>` : ''}`;

    const noteBtn = `<button class="btn btn-ghost btn-sm" data-action="note" data-id="${inv.id}" title="${hasNote ? esc(inv.notes) : 'Add note'}" style="${hasNote ? 'color:var(--gold)' : ''}">📝</button>`;

    const actions = isPaid
      ? `<button class="btn btn-ghost btn-sm" data-action="resendReceipt" data-id="${inv.id}">Resend Receipt</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`
      : `<button class="btn btn-primary btn-sm" data-action="markPaid" data-id="${inv.id}">Mark Paid</button>
         <button class="btn btn-ghost btn-sm" data-action="sendAgain" data-id="${inv.id}">Resend</button>
         <button class="btn btn-ghost btn-sm" data-action="sendReminder" data-id="${inv.id}" ${hasReminder ? 'style="color:var(--text-muted)"' : ''}>Remind</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`;

    const mainRow = `
      <tr style="${isSelected ? 'background:rgba(201,168,76,0.06)' : ''}">
        <td><input type="checkbox" class="row-check" data-id="${inv.id}" ${isSelected ? 'checked' : ''} style="accent-color:var(--gold)"></td>
        <td style="color:var(--gold);font-weight:600;font-size:13px">${esc(inv.invoice_number)}</td>
        <td><strong>${esc(inv.first_name)} ${esc(inv.last_name)}</strong></td>
        <td style="color:var(--text-muted);font-size:13px">${esc(parseLeadTypes(inv.line_items_raw))}</td>
        <td style="color:var(--text-muted)">${formatDate(inv.invoice_date)}</td>
        <td style="font-weight:600">${fmt(inv.total_amount)}</td>
        <td>${statusBadge}</td>
        <td><div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">${actions}</div></td>
      </tr>
    `;

    const noteRow = hasNote
      ? `<tr>
           <td colspan="8" style="padding:0 20px 10px 52px;border-bottom:none">
             <div style="border-left:2px solid var(--gold);padding:6px 12px;background:rgba(201,168,76,0.05);font-size:12px;color:var(--text-muted);font-style:italic;border-radius:0 4px 4px 0">
               ${esc(inv.notes)}
             </div>
           </td>
         </tr>`
      : '';

    return mainRow + noteRow;
  }
```

- [ ] **Step 2: Add "Custom Invoices" option to the lead type filter dropdown**

Find the `<select id="leadTypeFilter">` in the `render()` function. Add a new option group:

```javascript
          <select id="leadTypeFilter" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer">
            <option value="all" ${leadTypeFilter === 'all' ? 'selected' : ''}>All Lead Types</option>
            ${ALL_LEAD_TYPES.map(lt => `<option value="${esc(lt)}" ${leadTypeFilter === lt ? 'selected' : ''}>${lt}</option>`).join('')}
            <option value="__custom__" ${leadTypeFilter === '__custom__' ? 'selected' : ''}>Custom Invoices</option>
          </select>
```

- [ ] **Step 3: Update `getFiltered()` to handle the `__custom__` sentinel**

Replace the `matchesLeadType` line in `getFiltered()`:

```javascript
      const matchesLeadType = leadTypeFilter === 'all'
        ? true
        : leadTypeFilter === '__custom__'
          ? inv.invoice_type === 'custom'
          : getRawLeadTypes(inv.line_items_raw).includes(leadTypeFilter);
```

- [ ] **Step 4: Start the app and verify inline notes**

- Open the Invoices screen
- Find an invoice that has a note (use the 📝 button to add one if needed)
- Confirm the note text appears in a gold-bordered row directly below the invoice row without clicking anything
- Confirm invoices without notes show no extra row
- Confirm the 📝 button still works for editing

- [ ] **Step 5: Verify Custom Invoices filter**

- Generate a custom invoice from Create Invoice
- Open Invoices screen → open the lead type filter
- Select "Custom Invoices"
- Confirm only the custom invoice appears

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/invoices.js
git commit -m "feat: inline note row below invoice, Custom Invoices filter option"
```
