# Invoice Tracking & Paid Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Invoices screen to CFG Invoicing that tracks all sent invoices, lets the user mark them paid (auto-generating and emailing a PAID receipt PDF), resend invoices, and delete records — plus fixes invoice ID format, company address, and invoice footer.

**Architecture:** Seven sequential tasks touching backend (db, mailer, pdf-generator), the invoice template, IPC/preload wiring, and a new renderer screen. Each task is independently committable. Tasks 1–5 are backend/wiring; Task 6 is the new screen; Task 7 wires the nav.

**Tech Stack:** Electron 28, better-sqlite3, Nodemailer (Gmail SMTP), vanilla JS/HTML/CSS, existing `pdf-generator.js` hidden-BrowserWindow pattern.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/db.js` | Modify | Migration, new queries: markInvoicePaid, deleteInvoice, getInvoiceById |
| `src/invoice-number.js` | Modify | Random 6-digit ID instead of sequential |
| `src/mailer.js` | Modify | CFG branding on existing email; new sendPaidReceipt |
| `src/pdf-generator.js` | Modify | Pass paymentMethod to DB; add generatePaidPDF |
| `renderer/invoice-template/template.html` | Modify | Address, footer, PAID due-box state |
| `renderer/screens/invoices.js` | Create | Full invoices screen |
| `renderer/app.js` | Modify | Register invoices screen; updateUnpaidBadge |
| `renderer/index.html` | Modify | Invoices nav item with badge |
| `main.js` | Modify | New IPC handlers |
| `preload.js` | Modify | Expose new handlers |

---

## Task 1: Database Migration + New Queries

**Files:**
- Modify: `src/db.js`

- [ ] **Step 1: Add migration for new columns**

In `src/db.js`, update the `migrate(db)` function. After the existing `db.exec(...)` block, add:

```javascript
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      pdf_path TEXT,
      emailed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      lead_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      guaranteed_minimum INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
  `);

  // Safe column additions — no-op if already present
  const cols = db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name);
  if (!cols.includes('paid'))           db.exec('ALTER TABLE invoices ADD COLUMN paid INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('paid_at'))        db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT');
  if (!cols.includes('payment_method')) db.exec('ALTER TABLE invoices ADD COLUMN payment_method TEXT');
}
```

- [ ] **Step 2: Update createInvoice to store payment_method**

Replace the existing `createInvoice` function:

```javascript
function createInvoice(data) {
  const db = getDb();
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (client_id, invoice_number, invoice_date, total_amount, payment_method) VALUES (?, ?, ?, ?, ?)'
  );
  const insertLineItem = db.prepare(
    'INSERT INTO invoice_line_items (invoice_id, lead_type, quantity, unit_price, guaranteed_minimum) VALUES (?, ?, ?, ?, ?)'
  );

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(data.clientId, data.invoiceNumber, data.invoiceDate, data.totalAmount, data.paymentMethod || null);
    const invoiceId = result.lastInsertRowid;
    for (const item of data.lineItems) {
      insertLineItem.run(invoiceId, item.leadType, item.quantity, item.unitPrice, item.guaranteedMinimum || null);
    }
    return invoiceId;
  })();

  return invoiceId;
}
```

- [ ] **Step 3: Add markInvoicePaid, deleteInvoice, getInvoiceById**

Add these three functions after the existing `getInvoices` function:

```javascript
function markInvoicePaid(id) {
  getDb().prepare("UPDATE invoices SET paid=1, paid_at=datetime('now') WHERE id=?").run(id);
}

function deleteInvoice(id) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM invoice_line_items WHERE invoice_id=?').run(id);
    db.prepare('DELETE FROM invoices WHERE id=?').run(id);
  })();
}

function getInvoiceById(id) {
  const invoice = getDb().prepare(`
    SELECT i.*, c.first_name, c.last_name, c.email, c.phone
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    WHERE i.id = ?
  `).get(id);
  if (!invoice) return null;
  const lineItems = getDb().prepare(
    'SELECT lead_type, quantity, unit_price, guaranteed_minimum FROM invoice_line_items WHERE invoice_id=?'
  ).all(id);
  return {
    ...invoice,
    lineItems: lineItems.map(li => ({
      leadType: li.lead_type,
      quantity: li.quantity,
      unitPrice: li.unit_price,
      guaranteedMinimum: li.guaranteed_minimum
    }))
  };
}
```

- [ ] **Step 4: Export the new functions**

Update the `module.exports` line at the bottom of `src/db.js`:

```javascript
module.exports = {
  getClients, addClient, updateClient, deleteClient,
  createInvoice, updateInvoicePdfPath, markInvoiceEmailed,
  markInvoicePaid, deleteInvoice, getInvoiceById,
  getInvoices, getAllInvoices, getNextInvoiceSeq,
  getSetting, setSetting, getAllSettings,
  closeDb,
  _getDb: getDb
};
```

- [ ] **Step 5: Start the app and verify no crash**

```bash
npm start
```

Expected: app opens, no errors in terminal. The migration runs silently on first launch.

- [ ] **Step 6: Commit**

```bash
git add src/db.js
git commit -m "feat: add paid/payment_method columns, markInvoicePaid, deleteInvoice, getInvoiceById"
```

---

## Task 2: Invoice Number Format (Random 6-Digit)

**Files:**
- Modify: `src/invoice-number.js`
- Modify: `src/pdf-generator.js`

- [ ] **Step 1: Update invoice-number.js to use random 6-digit ID**

Replace the entire contents of `src/invoice-number.js`:

```javascript
function generateInvoiceNumber(lastName, firstName, date) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let last = clean(lastName).slice(0, 4).padEnd(4, '0');
  const first = clean(firstName).slice(0, 1) || '0';
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `INV-${datePart.slice(0, 4)}-${datePart.slice(4, 8)}-${last}${first}-${rand}`;
}

module.exports = { generateInvoiceNumber };
```

- [ ] **Step 2: Update pdf-generator.js to use new signature + store paymentMethod**

In `src/pdf-generator.js`, update `generateInvoicePDF`:

```javascript
async function generateInvoicePDF(data) {
  const { client, date, lineItems, totalAmount, saveFolder, sendEmail } = data;

  const settings = db.getAllSettings();
  const invoiceNumber = generateInvoiceNumber(client.last_name, client.first_name, date);

  const invoiceId = db.createInvoice({
    clientId: client.id,
    invoiceNumber,
    invoiceDate: date,
    totalAmount,
    lineItems,
    paymentMethod: data.paymentMethod || 'paymentZelle'
  });

  const clientFolderName = `${client.last_name}, ${client.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });

  const pdfPath = path.join(clientFolder, `${invoiceNumber}.pdf`);

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true }
  });

  const templatePath = path.join(__dirname, '..', 'renderer', 'invoice-template', 'template.html');
  const logoPath = path.join(__dirname, '..', 'renderer', 'assets', 'logo.png');
  let logoBase64 = '';
  try { logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64'); } catch (_) {}

  let pdfBuffer;
  try {
    await win.loadFile(templatePath);
    const payload = JSON.stringify({ client, date, lineItems, totalAmount, invoiceNumber, settings, logoBase64, paymentMethod: data.paymentMethod || 'paymentZelle', paid: false });
    await win.webContents.executeJavaScript(
      `window.__inv = JSON.parse(${JSON.stringify(payload)}); renderInvoice(window.__inv);`
    );
    await new Promise(resolve => setTimeout(resolve, 400));
    pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }

  fs.writeFileSync(pdfPath, pdfBuffer);
  db.updateInvoicePdfPath(invoiceId, pdfPath);

  return { invoiceId, invoiceNumber, pdfPath, client, sendEmail, settings };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/invoice-number.js src/pdf-generator.js
git commit -m "feat: random 6-digit invoice ID, store payment_method in PDF generation"
```

---

## Task 3: Invoice Template Updates

**Files:**
- Modify: `renderer/invoice-template/template.html`

- [ ] **Step 1: Update address in template**

In `renderInvoice()` inside `template.html`, replace the company-info div:

```javascript
// Find this:
`13243 Fox Glove St, Winter Garden, FL 34787<br>`
// Replace with:
`5728 Major Blvd STE 702, Orlando FL 32819<br>`
```

- [ ] **Step 2: Add PAID state to due-box CSS**

Add this CSS rule inside the `<style>` block:

```css
.due-box-paid { background: #2f9e44; color: #fff; padding: 16px 24px; border-radius: 8px; text-align: center; }
.due-box-paid .due-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.8); margin-bottom: 4px; }
.due-box-paid .due-value { font-size: 15px; font-weight: 700; color: #fff; }
```

- [ ] **Step 3: Update renderInvoice to handle paid state + footer**

Replace the due-box section and footer in `renderInvoice()`:

```javascript
// Due box — replace the static HTML with:
const dueBoxHtml = data.paid
  ? `<div class="due-box-paid">
       <div class="due-label">Status</div>
       <div class="due-value">PAID ✓</div>
     </div>`
  : `<div class="due-box">
       <div class="due-label">Payment Due</div>
       <div class="due-value">Upon Receipt</div>
     </div>`;

// Footer — replace the static footer with:
const footerNote = data.paid
  ? 'Payment received — thank you! · Checkmate Financial Group LLC · Florida LLC · L26000014292'
  : 'All sales are final. · Checkmate Financial Group LLC · Florida LLC · L26000014292';
```

Then in the HTML string, replace:
```javascript
// OLD due box:
`<div class="due-box">
  <div class="due-label">Payment Due</div>
  <div class="due-value">Upon Receipt</div>
</div>`
// NEW:
`${dueBoxHtml}`

// OLD footer note:
`<div class="footer-note">Checkmate Financial Group LLC · Florida LLC · L26000014292</div>`
// NEW:
`<div class="footer-note">${footerNote}</div>`
```

- [ ] **Step 4: Commit**

```bash
git add renderer/invoice-template/template.html
git commit -m "feat: update address to Orlando, All sales are final footer, PAID due-box state"
```

---

## Task 4: Mailer — CFG Branding + sendPaidReceipt

**Files:**
- Modify: `src/mailer.js`

- [ ] **Step 1: Update sendInvoiceEmail branding to CFG**

Replace the entire `sendInvoiceEmail` function:

```javascript
async function sendInvoiceEmail({ client, invoiceNumber, pdfPath, settings }) {
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error('Email not configured. Please set up SMTP in Settings.');
  }
  const transport = makeTransport(settings.smtpUser, settings.smtpPass);

  await transport.sendMail({
    from: `"Checkmate Financial Group LLC" <${settings.smtpUser}>`,
    to: client.email,
    subject: `Invoice ${invoiceNumber} from Checkmate Financial Group LLC`,
    text: `Hi ${client.first_name},\n\nPlease find your invoice ${invoiceNumber} attached.\n\nPayment is due upon receipt.\n\nThank you for your business!\n\nCheckmate Financial Group LLC`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
        <div style="background:#0a0a0a;padding:20px 28px;border-radius:8px 8px 0 0">
          <span style="font-size:18px;font-weight:800;letter-spacing:2px;color:#fff">CHECKMATE <span style="color:#c9a84c">FINANCIAL GROUP</span> LLC</span>
        </div>
        <div style="padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
          <p>Hi ${client.first_name},</p>
          <p style="margin-top:14px">Please find your invoice <strong>${invoiceNumber}</strong> attached to this email.</p>
          <p style="margin-top:14px;color:#888;font-size:13px">Payment is due upon receipt. If you have any questions, please reply to this email.</p>
          <p style="margin-top:28px">Thank you for your business!</p>
          <p style="margin-top:6px;font-weight:600">Checkmate Financial Group LLC</p>
        </div>
      </div>
    `,
    attachments: [{ filename: `${invoiceNumber}.pdf`, content: await fs.promises.readFile(pdfPath) }]
  });
}
```

- [ ] **Step 2: Add sendPaidReceipt function**

Add after `sendInvoiceEmail`:

```javascript
async function sendPaidReceipt({ client, invoiceNumber, pdfPath, settings }) {
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error('Email not configured. Please set up SMTP in Settings.');
  }
  const transport = makeTransport(settings.smtpUser, settings.smtpPass);

  await transport.sendMail({
    from: `"Checkmate Financial Group LLC" <${settings.smtpUser}>`,
    to: client.email,
    subject: `Payment Received — Invoice ${invoiceNumber}`,
    text: `Hi ${client.first_name},\n\nWe've received your payment for Invoice #${invoiceNumber}. Please find your receipt attached.\n\nThank you for your business!\n\nCheckmate Financial Group LLC`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
        <div style="background:#0a0a0a;padding:20px 28px;border-radius:8px 8px 0 0">
          <span style="font-size:18px;font-weight:800;letter-spacing:2px;color:#fff">CHECKMATE <span style="color:#c9a84c">FINANCIAL GROUP</span> LLC</span>
        </div>
        <div style="padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
          <p>Hi ${client.first_name},</p>
          <p style="margin-top:14px">We've received your payment for Invoice <strong>#${invoiceNumber}</strong>. Please find your receipt attached.</p>
          <div style="margin-top:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px;color:#166534;font-weight:600">
            ✓ Payment Received — Thank you!
          </div>
          <p style="margin-top:28px">Thank you for your business!</p>
          <p style="margin-top:6px;font-weight:600">Checkmate Financial Group LLC</p>
        </div>
      </div>
    `,
    attachments: [{ filename: `${invoiceNumber}-paid.pdf`, content: await fs.promises.readFile(pdfPath) }]
  });
}
```

- [ ] **Step 3: Export sendPaidReceipt**

```javascript
module.exports = { sendInvoiceEmail, sendPaidReceipt, testConnection };
```

- [ ] **Step 4: Commit**

```bash
git add src/mailer.js
git commit -m "feat: CFG branding on invoice email, add sendPaidReceipt"
```

---

## Task 5: PDF Generator (Paid PDF) + IPC Handlers + Preload

**Files:**
- Modify: `src/pdf-generator.js`
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Add generatePaidPDF to pdf-generator.js**

Add this function after `generateInvoicePDF` in `src/pdf-generator.js`:

```javascript
async function generatePaidPDF({ invoiceId, saveFolder }) {
  const invoice = db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const settings = db.getAllSettings();
  const logoPath = path.join(__dirname, '..', 'renderer', 'assets', 'logo.png');
  let logoBase64 = '';
  try { logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64'); } catch (_) {}

  const client = {
    first_name: invoice.first_name,
    last_name: invoice.last_name,
    email: invoice.email,
    phone: invoice.phone
  };

  const clientFolderName = `${invoice.last_name}, ${invoice.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });
  const pdfPath = path.join(clientFolder, `${invoice.invoice_number}-paid.pdf`);

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true }
  });

  const templatePath = path.join(__dirname, '..', 'renderer', 'invoice-template', 'template.html');
  let pdfBuffer;
  try {
    await win.loadFile(templatePath);
    const payload = JSON.stringify({
      client,
      date: invoice.invoice_date,
      lineItems: invoice.lineItems,
      totalAmount: invoice.total_amount,
      invoiceNumber: invoice.invoice_number,
      settings,
      logoBase64,
      paymentMethod: invoice.payment_method || 'paymentZelle',
      paid: true
    });
    await win.webContents.executeJavaScript(
      `window.__inv = JSON.parse(${JSON.stringify(payload)}); renderInvoice(window.__inv);`
    );
    await new Promise(resolve => setTimeout(resolve, 400));
    pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }

  fs.writeFileSync(pdfPath, pdfBuffer);
  db.markInvoicePaid(invoiceId);

  return { pdfPath, invoiceNumber: invoice.invoice_number, client };
}

module.exports = { generateInvoicePDF, generatePaidPDF };
```

- [ ] **Step 2: Add new IPC handlers to main.js**

Add these after the existing `ipcMain.handle('mail:testConnection', ...)` handler. Also update the require at the top to import `generatePaidPDF` and `sendPaidReceipt`:

```javascript
// Update the existing requires at the bottom of main.js:
const { generateInvoicePDF, generatePaidPDF } = require('./src/pdf-generator');
const { sendInvoiceEmail, sendPaidReceipt, testConnection } = require('./src/mailer');

// Add new IPC handlers:
ipcMain.handle('db:markInvoicePaid', (_, id) => db.markInvoicePaid(id));
ipcMain.handle('db:deleteInvoice', (_, id) => db.deleteInvoice(id));

ipcMain.handle('pdf:generatePaid', async (_, data) => {
  const result = await generatePaidPDF(data);
  return { pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});

ipcMain.handle('mail:sendPaidReceipt', async (_, { invoiceId }) => {
  const invoice = db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const settings = db.getAllSettings();
  const paidPdfPath = invoice.pdf_path.replace(/\.pdf$/, '-paid.pdf');
  await sendPaidReceipt({
    client: { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email },
    invoiceNumber: invoice.invoice_number,
    pdfPath: paidPdfPath,
    settings
  });
});

ipcMain.handle('mail:sendInvoiceAgain', async (_, { invoiceId }) => {
  const invoice = db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (!invoice.pdf_path) throw new Error('PDF not found for this invoice.');
  const settings = db.getAllSettings();
  await sendInvoiceEmail({
    client: { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email, phone: invoice.phone },
    invoiceNumber: invoice.invoice_number,
    pdfPath: invoice.pdf_path,
    settings
  });
});
```

- [ ] **Step 3: Update preload.js**

Replace the entire `preload.js`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    getClients: () => ipcRenderer.invoke('db:getClients'),
    addClient: (data) => ipcRenderer.invoke('db:addClient', data),
    updateClient: (id, data) => ipcRenderer.invoke('db:updateClient', id, data),
    deleteClient: (id) => ipcRenderer.invoke('db:deleteClient', id),
    getInvoices: (clientId) => ipcRenderer.invoke('db:getInvoices', clientId),
    createInvoice: (data) => ipcRenderer.invoke('db:createInvoice', data),
    getAllInvoices: () => ipcRenderer.invoke('db:getAllInvoices'),
    markInvoicePaid: (id) => ipcRenderer.invoke('db:markInvoicePaid', id),
    deleteInvoice: (id) => ipcRenderer.invoke('db:deleteInvoice', id),
  },
  pdf: {
    generate: (invoiceData) => ipcRenderer.invoke('pdf:generate', invoiceData),
    generatePaid: (data) => ipcRenderer.invoke('pdf:generatePaid', data),
  },
  mail: {
    send: (invoiceData, pdfPath) => ipcRenderer.invoke('mail:send', invoiceData, pdfPath),
    testConnection: (config) => ipcRenderer.invoke('mail:testConnection', config),
    sendPaidReceipt: (data) => ipcRenderer.invoke('mail:sendPaidReceipt', data),
    sendInvoiceAgain: (data) => ipcRenderer.invoke('mail:sendInvoiceAgain', data),
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/pdf-generator.js main.js preload.js
git commit -m "feat: generatePaidPDF, IPC handlers for paid flow, sendInvoiceAgain"
```

---

## Task 6: Invoices Screen

**Files:**
- Create: `renderer/screens/invoices.js`

- [ ] **Step 1: Create the invoices screen**

Create `renderer/screens/invoices.js` with this full content:

```javascript
const LEAD_TYPE_SHORT = {
  'Trucker IUL Leads': 'Trucker IUL',
  'Spanish IUL Leads': 'Spanish IUL',
  'Widow of Veteran Leads': 'Widow/Vet'
};

function parseLeadTypes(raw) {
  if (!raw) return '—';
  return raw.split(',')
    .map(r => { const [type] = r.split(':'); return LEAD_TYPE_SHORT[type] || type; })
    .join(', ');
}

function formatDate(d) {
  if (!d) return '—';
  const s = String(d).includes('T') ? d : d + 'T12:00:00';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function invoicesScreen(container) {
  let allInvoices = [];
  let filter = 'all';
  let search = '';

  try {
    allInvoices = await window.api.db.getAllInvoices();
  } catch (err) {
    console.error('Failed to load invoices:', err);
  }

  function getFiltered() {
    return allInvoices.filter(inv => {
      const matchesFilter = filter === 'all' || (filter === 'paid' ? inv.paid : !inv.paid);
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(q) ||
        inv.invoice_number.toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }

  function render() {
    const filtered = getFiltered();
    const unpaidCount = allInvoices.filter(i => !i.paid).length;
    const unpaidTotal = allInvoices.filter(i => !i.paid).reduce((s, i) => s + i.total_amount, 0);

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Invoices</h1>
        <input class="search-input" id="invoiceSearch" placeholder="Search client or invoice #..." value="${esc(search)}" style="width:260px">
      </div>

      <div class="card" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;padding:16px 24px">
        <div>
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total Outstanding</div>
          <div style="font-size:28px;font-weight:700;color:${unpaidTotal > 0 ? 'var(--red)' : 'var(--green)'}">${fmt(unpaidTotal)}</div>
        </div>
        <div style="font-size:13px;color:var(--text-muted)">${unpaidCount} unpaid invoice${unpaidCount !== 1 ? 's' : ''}</div>
      </div>

      <div class="card">
        <div style="display:flex;gap:6px;margin-bottom:20px">
          ${['all','unpaid','paid'].map(f => `
            <button class="btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}" data-filter="${f}">
              ${f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : 'Paid'}
            </button>
          `).join('')}
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Lead Types</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0
                ? `<tr><td colspan="7"><div class="empty-state"><h3>No invoices</h3><p>No invoices match your current filter.</p></div></td></tr>`
                : filtered.map(inv => renderRow(inv)).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('#invoiceSearch').addEventListener('input', e => {
      search = e.target.value;
      render();
    });

    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => { filter = btn.dataset.filter; render(); });
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, Number(btn.dataset.id)));
    });
  }

  function renderRow(inv) {
    const isPaid = !!inv.paid;
    const statusBadge = isPaid
      ? `<span class="badge badge-green">Paid</span><div style="font-size:11px;color:var(--text-muted);margin-top:3px">${formatDate(inv.paid_at)}</div>`
      : `<span class="badge badge-red">Unpaid</span>`;

    const actions = isPaid
      ? `<button class="btn btn-ghost btn-sm" data-action="resendReceipt" data-id="${inv.id}">Resend Receipt</button>
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`
      : `<button class="btn btn-primary btn-sm" data-action="markPaid" data-id="${inv.id}">Mark Paid</button>
         <button class="btn btn-ghost btn-sm" data-action="sendAgain" data-id="${inv.id}">Send Again</button>
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`;

    return `
      <tr>
        <td style="color:var(--gold);font-weight:600;font-size:13px">${esc(inv.invoice_number)}</td>
        <td><strong>${esc(inv.first_name)} ${esc(inv.last_name)}</strong></td>
        <td style="color:var(--text-muted);font-size:13px">${esc(parseLeadTypes(inv.line_items_raw))}</td>
        <td style="color:var(--text-muted)">${formatDate(inv.invoice_date)}</td>
        <td style="font-weight:600">${fmt(inv.total_amount)}</td>
        <td>${statusBadge}</td>
        <td><div style="display:flex;gap:6px;justify-content:flex-end">${actions}</div></td>
      </tr>
    `;
  }

  async function handleAction(action, invoiceId) {
    if (action === 'delete') {
      if (!confirm('Delete this invoice? This cannot be undone.')) return;
      try {
        await window.api.db.deleteInvoice(invoiceId);
        allInvoices = allInvoices.filter(i => i.id !== invoiceId);
        render();
        if (window.updateUnpaidBadge) window.updateUnpaidBadge();
        showToast('Invoice deleted.', 'success');
      } catch (err) {
        showToast('Failed to delete invoice.', 'error');
      }
      return;
    }

    const btn = container.querySelector(`[data-action="${action}"][data-id="${invoiceId}"]`);
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
      if (action === 'markPaid') {
        const saveFolder = await window.api.settings.get('saveFolder');
        if (!saveFolder) throw new Error('No save folder set in Settings.');
        await window.api.pdf.generatePaid({ invoiceId, saveFolder });
        await window.api.mail.sendPaidReceipt({ invoiceId });
        allInvoices = await window.api.db.getAllInvoices();
        render();
        if (window.updateUnpaidBadge) window.updateUnpaidBadge();
        showToast('Marked paid — receipt emailed!', 'success');
      } else if (action === 'sendAgain') {
        await window.api.mail.sendInvoiceAgain({ invoiceId });
        showToast('Invoice re-sent.', 'success');
      } else if (action === 'resendReceipt') {
        await window.api.mail.sendPaidReceipt({ invoiceId });
        showToast('Receipt re-sent.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Something went wrong.', 'error');
    } finally {
      if (btn) { btn.disabled = false; if (origText) btn.textContent = origText; }
    }
  }

  render();
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/screens/invoices.js
git commit -m "feat: invoices screen with paid/unpaid filter, mark paid, send again, delete"
```

---

## Task 7: Nav + App Router

**Files:**
- Modify: `renderer/index.html`
- Modify: `renderer/app.js`

- [ ] **Step 1: Add Invoices nav item with badge to index.html**

In `renderer/index.html`, add the Invoices nav entry between Batch Invoice and Analytics:

```html
<li><a href="#" data-screen="invoices" class="nav-link">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  Invoices
  <span id="unpaidBadge" style="display:none;background:var(--red);color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 7px;margin-left:auto;line-height:1.6">0</span>
</a></li>
```

- [ ] **Step 2: Register invoices screen and add updateUnpaidBadge to app.js**

Replace the entire contents of `renderer/app.js`:

```javascript
const screenLoaders = {
  clients: () => import('./screens/clients.js').then(m => m.clientsScreen),
  'create-invoice': () => import('./screens/create-invoice.js').then(m => m.createInvoiceScreen),
  'batch-invoice': () => import('./screens/bulk-invoice.js').then(m => m.batchInvoiceScreen),
  invoices: () => import('./screens/invoices.js').then(m => m.invoicesScreen),
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
  updateUnpaidBadge();
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
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

window.navigate = navigate;
window.updateUnpaidBadge = updateUnpaidBadge;

navigate('clients');
```

- [ ] **Step 3: Start the app and verify**

```bash
npm start
```

Expected:
- "Invoices" appears in the sidebar between Batch Invoice and Analytics
- Clicking Invoices shows the invoices screen with the table
- Red badge appears on the nav item when there are unpaid invoices
- Mark Paid generates a PAID PDF and sends confirmation email
- Send Again re-sends the original invoice
- Delete removes the invoice with a confirmation prompt

- [ ] **Step 4: Final commit**

```bash
git add renderer/index.html renderer/app.js
git commit -m "feat: invoices nav item with unpaid badge, register invoices screen"
```
