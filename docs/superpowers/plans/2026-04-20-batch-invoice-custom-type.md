# Batch Invoice Custom Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lead/Custom mode toggle to the batch invoice screen, plus fix the saveFolder bug introduced during the Supabase migration.

**Architecture:** Single-file change — `renderer/screens/bulk-invoice.js`. The mode toggle is a `let invoiceMode` closure variable; switching re-renders the entire screen via `renderScreen()` to swap lead-type checkboxes for free-form line item rows. The `getCheckedInvoices()` and `runBatch()` functions branch on `invoiceMode`.

**Tech Stack:** Vanilla JS/HTML/CSS, Electron renderer, `window.api.userConfig.getConfig()`, `window.api.pdf.generate()`

---

## File Map

| File | Change |
|------|--------|
| `renderer/screens/bulk-invoice.js` | Two tasks: fix saveFolder source, then full replacement with mode toggle + custom UI |

---

### Task 1: Fix saveFolder Bug

**Files:**
- Modify: `renderer/screens/bulk-invoice.js:14-17`

The `saveFolder` key was moved from Supabase settings to local user config during the cloud migration. The current read from `window.api.settings.get('saveFolder')` always returns `undefined`.

- [ ] **Step 1: Edit the data-fetch at the top of `batchInvoiceScreen`**

Replace lines 14–17 of `renderer/screens/bulk-invoice.js`:

**Old:**
```javascript
  const [clients, saveFolder] = await Promise.all([
    window.api.db.getClients(),
    window.api.settings.get('saveFolder')
  ]);
```

**New:**
```javascript
  const [clients, userCfg] = await Promise.all([
    window.api.db.getClients(),
    window.api.userConfig.getConfig()
  ]);
  const saveFolder = userCfg?.saveFolder;
```

- [ ] **Step 2: Fix the error message in `runBatch` to match the new source**

In `runBatch` (around line 157–160), change:
```javascript
    if (!saveFolder) {
      showToast('No save folder set — configure it in Settings first.', 'error');
```
To:
```javascript
    if (!saveFolder) {
      showToast('Save folder not configured. Go to Settings to set it up.', 'error');
```

- [ ] **Step 3: Commit**

```bash
git add renderer/screens/bulk-invoice.js
git commit -m "fix: read saveFolder from userConfig in batch invoice"
```

---

### Task 2: Add Mode Toggle + Custom Invoice Mode

**Files:**
- Modify: `renderer/screens/bulk-invoice.js` (complete replacement)

Replace the entire file with the version below. Key changes from the current file:

- `getStatus` moved to module scope (it was inside `batchInvoiceScreen` but doesn't need to be)
- `batchInvoiceScreen` no longer sets `container.innerHTML` directly — it calls `renderScreen()` instead
- `renderScreen()` preserves the date input across re-renders via a `currentDate` variable
- `renderClientRow` calls `renderLeadFields(idx)` or `renderCustomFields(idx)` based on `invoiceMode`
- `wireCustomEvents(idx)` handles add/remove for custom line item rows
- `getCheckedInvoices()` branches on `invoiceMode` to read either checkboxes or `.custom-item-row` elements
- `runBatch()` passes `invoiceType: invoiceMode` to `window.api.pdf.generate()`

- [ ] **Step 1: Replace `renderer/screens/bulk-invoice.js` with the complete implementation**

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

export async function batchInvoiceScreen(container) {
  const [clients, userCfg] = await Promise.all([
    window.api.db.getClients(),
    window.api.userConfig.getConfig()
  ]);
  const saveFolder = userCfg?.saveFolder;

  const today = new Date().toISOString().split('T')[0];
  let invoiceMode = 'lead';
  let currentDate = today;

  function renderScreen() {
    const dateInput = document.getElementById('batchDate');
    if (dateInput) currentDate = dateInput.value;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Batch Invoice</h1>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <label style="font-size:13px;font-weight:500;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap">Invoice Date</label>
          <input type="date" class="form-input" id="batchDate" value="${currentDate}" style="width:180px">
        </div>
        <div style="margin-left:auto;display:flex;gap:10px">
          <button class="btn btn-ghost" id="batchGenerateBtn">Generate Only</button>
          <button class="btn btn-primary" id="batchSendBtn">Generate &amp; Send All</button>
        </div>
      </div>

      <div style="display:flex;gap:0;margin-bottom:20px;border:1px solid var(--border);border-radius:6px;overflow:hidden;width:fit-content">
        <button id="modeLeadBtn" style="padding:8px 18px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:${invoiceMode === 'lead' ? 'var(--gold)' : 'var(--card-bg)'};color:${invoiceMode === 'lead' ? '#000' : 'var(--text-muted)'};transition:background 0.15s,color 0.15s">Lead Invoices</button>
        <button id="modeCustomBtn" style="padding:8px 18px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:${invoiceMode === 'custom' ? 'var(--gold)' : 'var(--card-bg)'};color:${invoiceMode === 'custom' ? '#000' : 'var(--text-muted)'};transition:background 0.15s,color 0.15s;border-left:1px solid var(--border)">Custom Invoices</button>
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

    wireEvents();
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
          ${invoiceMode === 'lead' ? renderLeadFields(idx) : renderCustomFields(idx)}
          <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
            <label style="font-size:13px;font-weight:500;color:var(--text-muted)">Payment:</label>
            <select class="form-select" id="batchPm${idx}" style="width:180px">
              ${PAYMENT_METHODS.map(pm => `<option value="${pm.key}">${pm.label}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeadFields(idx) {
    return `
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
    `;
  }

  function renderCustomFields(idx) {
    return `
      <div id="customItems${idx}" style="margin-bottom:8px">
        ${renderCustomItemRow(true)}
      </div>
      <button class="btn btn-ghost btn-sm" id="addLineBtn${idx}" style="font-size:12px">+ Add Line</button>
    `;
  }

  function renderCustomItemRow(isOnly) {
    return `
      <div class="custom-item-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="text" class="form-input custom-desc" placeholder="Description" style="flex:2">
        <input type="number" class="form-input custom-amt" placeholder="Amount" min="0" step="0.01" style="flex:1;min-width:80px">
        <button class="custom-remove btn btn-ghost" style="padding:4px 8px;font-size:16px;line-height:1;color:var(--text-muted)" ${isOnly ? 'disabled' : ''}>×</button>
      </div>
    `;
  }

  function wireEvents() {
    document.getElementById('modeLeadBtn').addEventListener('click', () => {
      if (invoiceMode === 'lead') return;
      invoiceMode = 'lead';
      renderScreen();
    });
    document.getElementById('modeCustomBtn').addEventListener('click', () => {
      if (invoiceMode === 'custom') return;
      invoiceMode = 'custom';
      renderScreen();
    });

    clients.forEach((c, idx) => {
      const check = document.getElementById(`batchCheck${idx}`);
      const fields = document.getElementById(`batchFields${idx}`);

      check.addEventListener('change', () => {
        fields.style.display = check.checked ? 'block' : 'none';
      });

      if (invoiceMode === 'lead') {
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
      } else {
        wireCustomEvents(idx);
      }
    });

    document.getElementById('batchSendBtn').addEventListener('click', () => runBatch(true));
    document.getElementById('batchGenerateBtn').addEventListener('click', () => runBatch(false));
  }

  function wireCustomEvents(idx) {
    const itemsContainer = document.getElementById(`customItems${idx}`);
    const addBtn = document.getElementById(`addLineBtn${idx}`);

    function refreshRemoveButtons() {
      const rows = itemsContainer.querySelectorAll('.custom-item-row');
      rows.forEach(row => {
        row.querySelector('.custom-remove').disabled = rows.length === 1;
      });
    }

    itemsContainer.addEventListener('click', e => {
      if (!e.target.classList.contains('custom-remove')) return;
      e.target.closest('.custom-item-row').remove();
      refreshRemoveButtons();
    });

    addBtn.addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = renderCustomItemRow(false);
      itemsContainer.appendChild(div.firstElementChild);
      refreshRemoveButtons();
    });
  }

  function getCheckedInvoices() {
    const date = document.getElementById('batchDate').value;
    const invoices = [];

    clients.forEach((c, idx) => {
      const check = document.getElementById(`batchCheck${idx}`);
      if (!check.checked) return;

      const lineItems = [];

      if (invoiceMode === 'lead') {
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
      } else {
        const rows = document.getElementById(`customItems${idx}`).querySelectorAll('.custom-item-row');
        rows.forEach(row => {
          const desc = row.querySelector('.custom-desc').value.trim();
          const amt = Number(row.querySelector('.custom-amt').value) || 0;
          lineItems.push({ leadType: desc, quantity: 1, unitPrice: amt, guaranteedMinimum: null });
        });
      }

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
        showToast(`${inv.client.first_name} ${inv.client.last_name}: no ${invoiceMode === 'lead' ? 'lead types' : 'line items'} added.`, 'error');
        return;
      }
      for (const item of inv.lineItems) {
        if (invoiceMode === 'custom' && !item.leadType) {
          showToast(`${inv.client.first_name} ${inv.client.last_name}: all line items need a description.`, 'error');
          return;
        }
        if (!item.unitPrice) {
          showToast(`${inv.client.first_name} ${inv.client.last_name}: enter an amount for all ${invoiceMode === 'lead' ? 'selected lead types' : 'line items'}.`, 'error');
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
          paymentMethod: inv.paymentMethod,
          invoiceType: invoiceMode
        });
        done++;
        results.push({ name, ok: true });
        progressItems.innerHTML = results.map(r =>
          `<div>${r.ok ? '✓' : '✗'} ${esc(r.name)}</div>`
        ).join('');
      } catch (err) {
        results.push({ name, ok: false, err: err.message });
        progressItems.innerHTML = results.map(r =>
          `<div style="color:${r.ok ? 'inherit' : 'var(--red)'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.err ? ' — ' + esc(r.err) : ''}</div>`
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

  renderScreen();
}

function getStatus(lastDate) {
  if (!lastDate) return { label: 'Overdue', cls: 'badge-red' };
  const last = new Date(lastDate); last.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((now - last) / 86400000);
  if (days < 6) return { label: 'Up to Date', cls: 'badge-green' };
  if (days === 6) return { label: 'Due Soon', cls: 'badge-yellow' };
  return { label: 'Overdue', cls: 'badge-red' };
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
```

- [ ] **Step 2: Verify the app loads the batch invoice screen without errors**

```bash
npm start
```

Navigate to Batch Invoice. Confirm:
- Screen loads with two clients (or your test clients) listed
- "Lead Invoices | Custom Invoices" segmented toggle appears above the client list
- "Lead Invoices" is active (gold background) by default

- [ ] **Step 3: Verify Lead mode works end-to-end**

1. Check a client — row expands showing lead type checkboxes (same as before)
2. Check "Trucker IUL Leads", enter an amount, set payment method
3. Click "Generate Only"
4. Progress bar appears, invoice generates successfully
5. Switch date to a custom value, then toggle to Custom mode — date is preserved

- [ ] **Step 4: Verify Custom mode UI**

1. Click "Custom Invoices" — toggle switches (gold background moves)
2. Expand a client — see one line item row with Description + Amount inputs and a disabled × button
3. Click "+ Add Line" — second row appears, × button on first row is now enabled
4. Add a second line, then click × on first row — first row removed, remaining row's × re-disables

- [ ] **Step 5: Verify Custom mode validation**

1. Check a client in Custom mode, leave description blank, enter amount → click Generate Only
   - Toast: `"[Name]: all line items need a description."`
2. Enter description, leave amount blank → click Generate Only
   - Toast: `"[Name]: enter an amount for all line items."`
3. Check a client but don't expand (no line items visible) — click Generate Only
   - Toast: `"[Name]: no line items added."`

- [ ] **Step 6: Verify Custom mode generates PDF with correct column header**

1. Fill in a valid custom line item (description + amount), click "Generate Only"
2. Open the generated PDF — column header should read "Description" (not "Lead Type")
3. Line item description appears in the Description column

- [ ] **Step 7: Commit**

```bash
git add renderer/screens/bulk-invoice.js
git commit -m "feat: add Lead/Custom mode toggle to batch invoice screen"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Covered |
|-----------------|---------|
| Segmented control "Lead Invoices / Custom Invoices" | ✅ Task 2, `renderScreen()` toggle buttons |
| Default: Lead Invoices | ✅ `let invoiceMode = 'lead'` |
| Switching re-renders expanded cards | ✅ `renderScreen()` called on toggle click |
| Collapsed rows unaffected | ✅ Fields hidden by default; mode switch re-renders all rows collapsed |
| Free-form line items: description + amount + × remove | ✅ `renderCustomItemRow()` |
| "+ Add Line" button | ✅ `wireCustomEvents()` addBtn |
| First row × disabled when only one row | ✅ `refreshRemoveButtons()` |
| Payment Method dropdown same as Lead mode | ✅ Both modes render same `batchPm${idx}` select |
| `leadType` stores description text | ✅ `lineItems.push({ leadType: desc, ... })` |
| Validation: at least one line item | ✅ `!inv.lineItems.length` check in `runBatch` |
| Validation: non-empty description | ✅ `!item.leadType` check in `runBatch` |
| Validation: non-zero amount | ✅ `!item.unitPrice` check in `runBatch` |
| Error toasts match existing style | ✅ Uses same `showToast(msg, 'error')` |
| `invoiceType: 'custom'` in PDF payload | ✅ `invoiceType: invoiceMode` in `pdf.generate()` call |
| No changes to pdf-generator.js, db.js, main.js | ✅ Only bulk-invoice.js modified |
| saveFolder read from `userConfig.getConfig()` | ✅ Task 1 + preserved in Task 2 |
| Error: 'Save folder not configured. Go to Settings to set it up.' | ✅ Exact string in `runBatch` |

**Placeholder scan:** None found.

**Type consistency:** `lineItems` shape `{ leadType, quantity, unitPrice, guaranteedMinimum }` — matches spec and `create-invoice.js` custom mode.
