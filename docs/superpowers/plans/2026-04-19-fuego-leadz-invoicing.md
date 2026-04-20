# Fuego Leadz Invoice Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium Electron desktop app for Fuego Leadz LLC to manage clients, generate PDF invoices, email them, and visualize revenue analytics.

**Architecture:** Electron app with a main process handling SQLite, PDF generation (hidden BrowserWindow + printToPDF), and email (Nodemailer). Renderer process handles all UI via a simple screen router. IPC bridge via contextBridge in preload.js.

**Tech Stack:** Electron 28, better-sqlite3, Nodemailer, Chart.js (CDN), Jest for unit tests.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `main.js`
- Create: `preload.js`
- Create: `renderer/index.html`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "fuego-leadz",
  "version": "1.0.0",
  "description": "Fuego Leadz Invoice Manager",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "jest": "^29.0.0"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "nodemailer": "^6.9.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create main.js**

```javascript
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 4: Create preload.js (skeleton — will be expanded in later tasks)**

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
  },
  pdf: {
    generate: (invoiceData, savePath) => ipcRenderer.invoke('pdf:generate', invoiceData, savePath),
  },
  mail: {
    send: (invoiceData, pdfPath) => ipcRenderer.invoke('mail:send', invoiceData, pdfPath),
    testConnection: (config) => ipcRenderer.invoke('mail:testConnection', config),
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
  }
});
```

- [ ] **Step 5: Create renderer/index.html (skeleton)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://fonts.googleapis.com https://fonts.gstatic.com;">
  <title>Fuego Leadz</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <div id="app">
    <nav id="sidebar">
      <div class="sidebar-logo">
        <span class="logo-text">FUEGO <span class="gold">LEADZ</span></span>
      </div>
      <ul class="nav-links">
        <li><a href="#" data-screen="clients" class="nav-link active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Clients
        </a></li>
        <li><a href="#" data-screen="dashboard" class="nav-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Analytics
        </a></li>
        <li><a href="#" data-screen="settings" class="nav-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          Settings
        </a></li>
      </ul>
    </nav>
    <main id="screen-container"></main>
  </div>
  <script src="app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 6: Verify app launches**

```bash
npm start
```

Expected: Electron window opens with a dark background, sidebar visible. No console errors.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: electron scaffold with main process and app shell"
```

---

## Task 2: Database Layer

**Files:**
- Create: `src/db.js`
- Create: `tests/db.test.js`

- [ ] **Step 1: Create src/db.js**

```javascript
const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function getDb() {
  if (db) return db;
  const userDataPath = app ? app.getPath('userData') : path.join(__dirname, '..', 'test-data');
  db = new Database(path.join(userDataPath, 'fuego-leadz.db'));
  migrate(db);
  return db;
}

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
  `);
}

// Clients
function getClients() {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT invoice_date FROM invoices WHERE client_id = c.id ORDER BY invoice_date DESC LIMIT 1) as last_invoice_date,
      (SELECT total_amount FROM invoices WHERE client_id = c.id ORDER BY invoice_date DESC LIMIT 1) as last_invoice_amount
    FROM clients c
    ORDER BY c.last_name, c.first_name
  `).all();
}

function addClient(data) {
  const stmt = getDb().prepare(
    'INSERT INTO clients (first_name, last_name, email, phone) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(data.firstName, data.lastName, data.email, data.phone);
  return result.lastInsertRowid;
}

function updateClient(id, data) {
  getDb().prepare(
    'UPDATE clients SET first_name=?, last_name=?, email=?, phone=? WHERE id=?'
  ).run(data.firstName, data.lastName, data.email, data.phone, id);
}

function deleteClient(id) {
  getDb().prepare('DELETE FROM clients WHERE id=?').run(id);
}

// Invoices
function createInvoice(data) {
  const db = getDb();
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (client_id, invoice_number, invoice_date, total_amount) VALUES (?, ?, ?, ?)'
  );
  const insertLineItem = db.prepare(
    'INSERT INTO invoice_line_items (invoice_id, lead_type, quantity, unit_price, guaranteed_minimum) VALUES (?, ?, ?, ?, ?)'
  );

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(data.clientId, data.invoiceNumber, data.invoiceDate, data.totalAmount);
    const invoiceId = result.lastInsertRowid;
    for (const item of data.lineItems) {
      insertLineItem.run(invoiceId, item.leadType, item.quantity, item.unitPrice, item.guaranteedMinimum || null);
    }
    return invoiceId;
  })();

  return invoiceId;
}

function updateInvoicePdfPath(id, pdfPath) {
  getDb().prepare('UPDATE invoices SET pdf_path=? WHERE id=?').run(pdfPath, id);
}

function markInvoiceEmailed(id) {
  getDb().prepare('UPDATE invoices SET emailed=1 WHERE id=?').run(id);
}

function getInvoices(clientId) {
  return getDb().prepare(`
    SELECT i.*, GROUP_CONCAT(li.lead_type) as lead_types
    FROM invoices i
    LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
    WHERE i.client_id = ?
    GROUP BY i.id
    ORDER BY i.invoice_date DESC
  `).all(clientId);
}

function getAllInvoices() {
  return getDb().prepare(`
    SELECT i.*, c.first_name, c.last_name, c.email,
      GROUP_CONCAT(li.lead_type || ':' || li.quantity || ':' || li.unit_price || ':' || COALESCE(li.guaranteed_minimum,'')) as line_items_raw
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
    GROUP BY i.id
    ORDER BY i.invoice_date DESC
  `).all();
}

function getNextInvoiceSeq(clientId) {
  const row = getDb().prepare(
    'SELECT COUNT(*) as cnt FROM invoices WHERE client_id=?'
  ).get(clientId);
  return row.cnt + 1;
}

// Settings
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, value);
}

function getAllSettings() {
  return getDb().prepare('SELECT key, value FROM settings').all()
    .reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
}

module.exports = {
  getClients, addClient, updateClient, deleteClient,
  createInvoice, updateInvoicePdfPath, markInvoiceEmailed, getInvoices, getAllInvoices, getNextInvoiceSeq,
  getSetting, setSetting, getAllSettings,
  _getDb: getDb
};
```

- [ ] **Step 2: Write tests/db.test.js**

```javascript
// Tests run outside Electron — db.js uses test-data/ path when app is null
process.env.NODE_ENV = 'test';
const path = require('path');
const fs = require('fs');

// Stub electron app
jest.mock('electron', () => ({ app: null }), { virtual: true });

const testDataDir = path.join(__dirname, '..', 'test-data');
beforeAll(() => fs.mkdirSync(testDataDir, { recursive: true }));
afterAll(() => fs.rmSync(testDataDir, { recursive: true, force: true }));

// Reset db module between tests
beforeEach(() => {
  jest.resetModules();
  fs.rmSync(path.join(testDataDir, 'fuego-leadz.db'), { force: true });
});

function getDb() {
  return require('../src/db');
}

test('addClient and getClients', () => {
  const db = getDb();
  const id = db.addClient({ firstName: 'John', lastName: 'Smith', email: 'john@test.com', phone: '5551234567' });
  expect(id).toBe(1);
  const clients = db.getClients();
  expect(clients).toHaveLength(1);
  expect(clients[0].first_name).toBe('John');
  expect(clients[0].last_name).toBe('Smith');
});

test('updateClient updates fields', () => {
  const db = getDb();
  const id = db.addClient({ firstName: 'John', lastName: 'Smith', email: 'j@test.com', phone: '5551234567' });
  db.updateClient(id, { firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', phone: '5559999999' });
  const clients = db.getClients();
  expect(clients[0].first_name).toBe('Jane');
  expect(clients[0].email).toBe('jane@test.com');
});

test('createInvoice saves invoice and line items', () => {
  const db = getDb();
  const clientId = db.addClient({ firstName: 'John', lastName: 'Smith', email: 'j@test.com', phone: '5551234567' });
  const invoiceId = db.createInvoice({
    clientId,
    invoiceNumber: 'INV-2026-0419-SMIT-001',
    invoiceDate: '2026-04-19',
    totalAmount: 500,
    lineItems: [
      { leadType: 'Trucker IUL Leads', quantity: 50, unitPrice: 10, guaranteedMinimum: 30 }
    ]
  });
  expect(invoiceId).toBe(1);
  const invoices = db.getInvoices(clientId);
  expect(invoices).toHaveLength(1);
  expect(invoices[0].invoice_number).toBe('INV-2026-0419-SMIT-001');
});

test('getSetting and setSetting', () => {
  const db = getDb();
  db.setSetting('saveFolder', '/tmp/invoices');
  expect(db.getSetting('saveFolder')).toBe('/tmp/invoices');
  db.setSetting('saveFolder', '/tmp/invoices-v2');
  expect(db.getSetting('saveFolder')).toBe('/tmp/invoices-v2');
});

test('getNextInvoiceSeq increments per client', () => {
  const db = getDb();
  const clientId = db.addClient({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '5550000000' });
  expect(db.getNextInvoiceSeq(clientId)).toBe(1);
  db.createInvoice({ clientId, invoiceNumber: 'INV-001', invoiceDate: '2026-04-19', totalAmount: 100, lineItems: [] });
  expect(db.getNextInvoiceSeq(clientId)).toBe(2);
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/db.test.js
```

Expected: 5 tests pass.

- [ ] **Step 4: Wire DB handlers into main.js — add after createWindow()**

```javascript
const db = require('./src/db');

// DB handlers
ipcMain.handle('db:getClients', () => db.getClients());
ipcMain.handle('db:addClient', (_, data) => db.addClient(data));
ipcMain.handle('db:updateClient', (_, id, data) => db.updateClient(id, data));
ipcMain.handle('db:deleteClient', (_, id) => db.deleteClient(id));
ipcMain.handle('db:getInvoices', (_, clientId) => db.getInvoices(clientId));
ipcMain.handle('db:createInvoice', (_, data) => db.createInvoice(data));
ipcMain.handle('db:getAllInvoices', () => db.getAllInvoices());
ipcMain.handle('settings:get', (_, key) => db.getSetting(key));
ipcMain.handle('settings:set', (_, key, value) => db.setSetting(key, value));
ipcMain.handle('settings:getAll', () => db.getAllSettings());
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: SQLite database layer with full CRUD and tests"
```

---

## Task 3: Invoice Number Generator

**Files:**
- Create: `src/invoice-number.js`
- Create: `tests/invoice-number.test.js`

- [ ] **Step 1: Write tests/invoice-number.test.js**

```javascript
const { generateInvoiceNumber } = require('../src/invoice-number');

test('generates correct format', () => {
  const num = generateInvoiceNumber('Smith', '2026-04-19', 1);
  expect(num).toBe('INV-2026-0419-SMIT-001');
});

test('pads sequence to 3 digits', () => {
  expect(generateInvoiceNumber('Doe', '2026-04-19', 12)).toBe('INV-2026-0419-DOEJ-012');
});

test('handles short last names', () => {
  expect(generateInvoiceNumber('Li', '2026-04-19', 1)).toBe('INV-2026-0419-LI00-001');
});

test('handles special characters in last name', () => {
  expect(generateInvoiceNumber("O'Brien", '2026-04-19', 1)).toBe('INV-2026-0419-OBRI-001');
});
```

Wait — the format needs a first-name initial too. Looking at the spec: `INV-2026-0419-SMITHJ-001` — last name first 4 + first initial. Let me correct:

- [ ] **Step 1: Write tests/invoice-number.test.js (corrected)**

```javascript
const { generateInvoiceNumber } = require('../src/invoice-number');

test('generates correct format with last name + first initial', () => {
  const num = generateInvoiceNumber('Smith', 'John', '2026-04-19', 1);
  expect(num).toBe('INV-2026-0419-SMITJ-001');
});

test('pads sequence to 3 digits', () => {
  expect(generateInvoiceNumber('Doe', 'Jane', '2026-04-19', 12)).toBe('INV-2026-0419-DOEJ-012');
});

test('handles last name shorter than 4 chars', () => {
  expect(generateInvoiceNumber('Li', 'Bob', '2026-04-19', 1)).toBe('INV-2026-0419-LI0B-001');
});

test('strips special characters', () => {
  expect(generateInvoiceNumber("O'Brien", 'Mike', '2026-04-19', 1)).toBe('INV-2026-0419-OBRIM-001');
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npm test -- tests/invoice-number.test.js
```

Expected: FAIL — "Cannot find module '../src/invoice-number'"

- [ ] **Step 3: Create src/invoice-number.js**

```javascript
function generateInvoiceNumber(lastName, firstName, date, seq) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const last = clean(lastName).padEnd(4, '0').slice(0, 4);
  const first = clean(firstName).slice(0, 1) || '0';
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const seqPart = String(seq).padStart(3, '0');
  return `INV-${datePart.slice(0, 4)}-${datePart.slice(4, 8)}-${last}${first}-${seqPart}`;
}

module.exports = { generateInvoiceNumber };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/invoice-number.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: invoice number generator with tests"
```

---

## Task 4: Global Styles + App Router

**Files:**
- Create: `renderer/styles/main.css`
- Create: `renderer/app.js`

- [ ] **Step 1: Create renderer/styles/main.css**

```css
:root {
  --black: #0a0a0a;
  --dark: #111111;
  --card: #1a1a1a;
  --border: #2a2a2a;
  --gold: #c9a84c;
  --gold-light: #e4c47a;
  --gold-dim: rgba(201, 168, 76, 0.15);
  --text: #f0f0f0;
  --text-muted: #888;
  --text-dim: #555;
  --green: #2f9e44;
  --green-bg: rgba(47, 158, 68, 0.12);
  --yellow: #e67700;
  --yellow-bg: rgba(230, 119, 0, 0.12);
  --red: #e03131;
  --red-bg: rgba(224, 49, 49, 0.12);
  --radius: 10px;
  --radius-sm: 6px;
  --shadow: 0 4px 24px rgba(0,0,0,0.4);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--black);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: flex;
  height: 100vh;
}

/* Sidebar */
#sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--dark);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 24px 0;
}

.sidebar-logo {
  padding: 0 20px 28px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text);
}

.sidebar-logo .gold { color: var(--gold); }

.nav-links { list-style: none; padding: 0 10px; }

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
}

.nav-link svg { width: 18px; height: 18px; flex-shrink: 0; }

.nav-link:hover { background: var(--gold-dim); color: var(--gold); }
.nav-link.active { background: var(--gold-dim); color: var(--gold); }

/* Screen container */
#screen-container {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  background: var(--black);
}

/* Page header */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.page-title { font-size: 24px; font-weight: 700; }

/* Buttons */
.btn {
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  font-family: inherit;
}

.btn-primary {
  background: var(--gold);
  color: #000;
}
.btn-primary:hover { background: var(--gold-light); }

.btn-ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
}
.btn-ghost:hover { border-color: var(--gold); color: var(--gold); }

.btn-danger {
  background: transparent;
  color: var(--red);
  border: 1px solid var(--red);
}
.btn-danger:hover { background: var(--red-bg); }

.btn-sm { padding: 6px 12px; font-size: 13px; }

/* Cards */
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}

/* Table */
.table-wrap { overflow-x: auto; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th {
  text-align: left;
  padding: 10px 14px;
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(255,255,255,0.02); }

/* Status badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.badge-green { background: var(--green-bg); color: var(--green); }
.badge-yellow { background: var(--yellow-bg); color: var(--yellow); }
.badge-red { background: var(--red-bg); color: var(--red); }

/* Forms */
.form-group { margin-bottom: 18px; }

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 7px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.form-input, .form-select {
  width: 100%;
  padding: 10px 12px;
  background: var(--dark);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus, .form-select:focus { border-color: var(--gold); }

.form-input::placeholder { color: var(--text-dim); }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

/* Search */
.search-input {
  padding: 9px 14px 9px 38px;
  background: var(--dark);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  width: 280px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.35-4.35'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: 12px center;
}

.search-input:focus { border-color: var(--gold); }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px;
  width: 480px;
  max-width: calc(100vw - 40px);
  box-shadow: var(--shadow);
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 22px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

/* Summary cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.summary-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
}

.summary-card .label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.summary-card .value {
  font-size: 26px;
  font-weight: 700;
  color: var(--gold);
}

.summary-card .sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 20px;
  font-size: 14px;
  box-shadow: var(--shadow);
  z-index: 200;
  animation: slideUp 0.2s ease;
}

.toast.success { border-left: 3px solid var(--green); }
.toast.error { border-left: 3px solid var(--red); }

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* Checkbox group for lead types */
.checkbox-group { display: flex; flex-direction: column; gap: 10px; }

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s;
}

.checkbox-item:hover { border-color: var(--gold); }
.checkbox-item.checked { border-color: var(--gold); background: var(--gold-dim); }

.checkbox-item input[type=checkbox] { accent-color: var(--gold); width: 16px; height: 16px; }

/* Lead item fields (shown when checkbox checked) */
.lead-fields {
  display: none;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  padding: 12px;
  background: var(--dark);
  border-radius: var(--radius-sm);
  margin-top: 8px;
}

.lead-fields.visible { display: grid; }

/* Empty state */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}

.empty-state h3 { font-size: 18px; margin-bottom: 8px; color: var(--text); }
.empty-state p { font-size: 14px; }
```

- [ ] **Step 2: Create renderer/app.js**

```javascript
import { clientsScreen } from './screens/clients.js';
import { dashboardScreen } from './screens/dashboard.js';
import { settingsScreen } from './screens/settings.js';

const screens = {
  clients: clientsScreen,
  dashboard: dashboardScreen,
  settings: settingsScreen,
};

let currentScreen = 'clients';

function navigate(screenName) {
  currentScreen = screenName;
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === screenName);
  });
  const container = document.getElementById('screen-container');
  screens[screenName](container);
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

// Expose navigate globally so screens can redirect
window.navigate = navigate;

navigate('clients');
```

- [ ] **Step 3: Verify app still launches with no errors**

```bash
npm start
```

Expected: Window opens, no console errors. Screen container is empty (screens not written yet).

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: global styles black/gold theme and screen router"
```

---

## Task 5: Client List Screen

**Files:**
- Create: `renderer/screens/clients.js`

- [ ] **Step 1: Create renderer/screens/clients.js**

```javascript
export async function clientsScreen(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Clients</h1>
      <div style="display:flex;gap:10px;align-items:center">
        <input class="search-input" id="clientSearch" placeholder="Search clients...">
        <button class="btn btn-primary" id="addClientBtn">+ Add Client</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="clientTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Last Invoice</th>
              <th>Last Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="clientBody"></tbody>
        </table>
      </div>
    </div>
  `;

  let clients = await window.api.db.getClients();
  renderTable(clients);

  document.getElementById('clientSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = clients.filter(c =>
      `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('addClientBtn').addEventListener('click', () => {
    openClientModal(null, async () => {
      clients = await window.api.db.getClients();
      renderTable(clients);
    });
  });

  function getStatus(lastInvoiceDate) {
    if (!lastInvoiceDate) return { label: 'Overdue', cls: 'badge-red' };
    const days = Math.floor((Date.now() - new Date(lastInvoiceDate)) / 86400000);
    if (days < 6) return { label: 'Up to Date', cls: 'badge-green' };
    if (days === 6) return { label: 'Due Soon', cls: 'badge-yellow' };
    return { label: 'Overdue', cls: 'badge-red' };
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatAmount(a) {
    if (!a) return '—';
    return '$' + Number(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderTable(data) {
    const body = document.getElementById('clientBody');
    if (!data.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No clients yet</h3><p>Add your first client to get started.</p></div></td></tr>`;
      return;
    }
    body.innerHTML = data.map(c => {
      const status = getStatus(c.last_invoice_date);
      return `
        <tr>
          <td><strong>${c.first_name} ${c.last_name}</strong></td>
          <td style="color:var(--text-muted)">${c.email}</td>
          <td style="color:var(--text-muted)">${c.phone}</td>
          <td style="color:var(--text-muted)">${formatDate(c.last_invoice_date)}</td>
          <td>${formatAmount(c.last_invoice_amount)}</td>
          <td><span class="badge ${status.cls}">${status.label}</span></td>
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" data-action="invoice" data-id="${c.id}" data-name="${c.first_name} ${c.last_name}">New Invoice</button>
              <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${c.id}">Edit</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('[data-action="invoice"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.navigate('create-invoice', { clientId: Number(btn.dataset.id), clientName: btn.dataset.name });
      });
    });

    body.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const client = clients.find(c => c.id === Number(btn.dataset.id));
        openClientModal(client, async () => {
          clients = await window.api.db.getClients();
          renderTable(clients);
        });
      });
    });
  }
}

function openClientModal(existing, onSave) {
  const isEdit = !!existing;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">${isEdit ? 'Edit Client' : 'Add Client'}</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input class="form-input" id="mFirstName" value="${isEdit ? existing.first_name : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input class="form-input" id="mLastName" value="${isEdit ? existing.last_name : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="mEmail" type="email" value="${isEdit ? existing.email : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="mPhone" value="${isEdit ? existing.phone : ''}">
      </div>
      <div id="formError" style="color:var(--red);font-size:13px;margin-top:-8px;margin-bottom:8px;display:none"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">Cancel</button>
        <button class="btn btn-primary" id="mSave">${isEdit ? 'Save Changes' : 'Add Client'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#mCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#mSave').addEventListener('click', async () => {
    const data = {
      firstName: overlay.querySelector('#mFirstName').value.trim(),
      lastName: overlay.querySelector('#mLastName').value.trim(),
      email: overlay.querySelector('#mEmail').value.trim(),
      phone: overlay.querySelector('#mPhone').value.trim(),
    };

    const err = overlay.querySelector('#formError');
    if (!data.firstName || !data.lastName) { err.textContent = 'First and last name are required.'; err.style.display='block'; return; }
    if (!data.email.includes('@')) { err.textContent = 'Please enter a valid email.'; err.style.display='block'; return; }
    if (!data.phone) { err.textContent = 'Phone number is required.'; err.style.display='block'; return; }

    if (isEdit) {
      await window.api.db.updateClient(existing.id, data);
    } else {
      await window.api.db.addClient(data);
    }
    overlay.remove();
    await onSave();
    showToast(isEdit ? 'Client updated.' : 'Client added.', 'success');
  });
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
```

- [ ] **Step 2: Update navigate() in app.js to pass params to screens**

Replace the `navigate` function in `renderer/app.js`:

```javascript
function navigate(screenName, params = {}) {
  currentScreen = screenName;
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.screen === screenName);
  });
  const container = document.getElementById('screen-container');
  screens[screenName](container, params);
}
```

- [ ] **Step 3: Launch and test manually**

```bash
npm start
```

Expected:
- Clients screen loads with empty state
- Clicking "Add Client" opens modal
- Fill in fields and save → row appears in table
- Status badge shows "Overdue" for new client (no invoices)
- Edit button opens modal pre-filled

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: client list screen with status badges, add/edit modal"
```

---

## Task 6: Invoice Creation Screen

**Files:**
- Create: `renderer/screens/create-invoice.js`
- Modify: `renderer/app.js` (add create-invoice to screens map)

- [ ] **Step 1: Create renderer/screens/create-invoice.js**

```javascript
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
              ${clients.map(c => `<option value="${c.id}" ${c.id === params.clientId ? 'selected' : ''}>${c.first_name} ${c.last_name}</option>`).join('')}
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
        <button class="btn btn-primary" id="generateSendBtn">Generate & Send Email</button>
        <button class="btn btn-ghost" id="generateOnlyBtn">Generate Only</button>
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => window.navigate('clients'));

  // Show/hide lead fields on checkbox toggle
  document.querySelectorAll('.lead-check').forEach((cb, i) => {
    cb.addEventListener('change', () => {
      const item = document.getElementById(`checkItem${i}`);
      const fields = document.getElementById(`fields${i}`);
      item.classList.toggle('checked', cb.checked);
      fields.classList.toggle('visible', cb.checked);
      updateTotal();
    });
  });

  // Recalculate total on any input change
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
    // Preview only — actual seq from db at generate time
    document.getElementById('invoiceNumPreview').textContent = `INV-${date.replace(/-/g,'').slice(0,4)}-${date.replace(/-/g,'').slice(4,8)}-${client.last_name.toUpperCase().slice(0,4)}${client.first_name[0].toUpperCase()}-???`;
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

    document.getElementById('generateSendBtn').disabled = true;
    document.getElementById('generateOnlyBtn').disabled = true;
    document.getElementById('generateSendBtn').textContent = 'Generating...';

    try {
      const result = await window.api.pdf.generate({
        client, date, lineItems, totalAmount, saveFolder, sendEmail
      });
      showToast(sendEmail ? 'Invoice generated and emailed!' : 'Invoice generated!', 'success');
      setTimeout(() => window.navigate('clients'), 1200);
    } catch (e) {
      err.textContent = e.message || 'Failed to generate invoice.';
      err.style.display = 'block';
      document.getElementById('generateSendBtn').disabled = false;
      document.getElementById('generateOnlyBtn').disabled = false;
      document.getElementById('generateSendBtn').textContent = 'Generate & Send Email';
    }
  }

  document.getElementById('generateSendBtn').addEventListener('click', () => generate(true));
  document.getElementById('generateOnlyBtn').addEventListener('click', () => generate(false));

  updatePreview();
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
```

- [ ] **Step 2: Add create-invoice to screens map in renderer/app.js**

```javascript
import { clientsScreen } from './screens/clients.js';
import { createInvoiceScreen } from './screens/create-invoice.js';
import { dashboardScreen } from './screens/dashboard.js';
import { settingsScreen } from './screens/settings.js';

const screens = {
  clients: clientsScreen,
  'create-invoice': createInvoiceScreen,
  dashboard: dashboardScreen,
  settings: settingsScreen,
};
```

- [ ] **Step 3: Launch and test manually**

```bash
npm start
```

Expected:
- Add a client, click "New Invoice" on their row
- Create invoice screen loads with client pre-selected
- Check lead type boxes → fields expand
- Enter qty/price → total updates live
- "Back" button returns to clients list

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: invoice creation screen with lead type selection and live total"
```

---

## Task 7: Invoice HTML Template

**Files:**
- Create: `renderer/invoice-template/template.html`

- [ ] **Step 1: Create renderer/invoice-template/template.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #111; font-size: 13px; }
    .page { padding: 48px; max-width: 780px; margin: 0 auto; }

    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 28px; border-bottom: 3px solid #c9a84c; }
    .company-name { font-size: 28px; font-weight: 800; letter-spacing: 3px; color: #111; }
    .company-name span { color: #c9a84c; }
    .company-info { font-size: 11px; color: #555; line-height: 1.7; margin-top: 4px; }
    .invoice-meta { text-align: right; }
    .invoice-label { font-size: 32px; font-weight: 800; color: #c9a84c; letter-spacing: 2px; }
    .invoice-detail { font-size: 12px; color: #555; margin-top: 6px; line-height: 1.8; }
    .invoice-detail strong { color: #111; }

    /* Bill To */
    .bill-section { display: flex; justify-content: space-between; margin-bottom: 36px; }
    .bill-to-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #c9a84c; margin-bottom: 8px; }
    .bill-to-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .bill-to-detail { font-size: 12px; color: #555; line-height: 1.8; }
    .due-box { background: #0a0a0a; color: #fff; padding: 16px 24px; border-radius: 8px; text-align: center; }
    .due-box .due-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #aaa; margin-bottom: 4px; }
    .due-box .due-value { font-size: 15px; font-weight: 700; color: #c9a84c; }

    /* Table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    .items-table thead tr { background: #0a0a0a; }
    .items-table thead th { padding: 11px 14px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #c9a84c; font-weight: 600; }
    .items-table thead th:last-child { text-align: right; }
    .items-table tbody td { padding: 13px 14px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: middle; }
    .items-table tbody td:last-child { text-align: right; font-weight: 600; }
    .items-table tbody tr:last-child td { border-bottom: none; }
    .gmin-badge { display: inline-block; background: #f0f7f0; color: #2f7d32; font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 600; margin-left: 6px; }
    .total-row { background: #fafafa; }
    .total-row td { padding: 14px; font-weight: 700; font-size: 15px; }

    /* Payment */
    .payment-section { margin-top: 36px; padding: 20px; background: #fafafa; border-radius: 8px; border: 1px solid #eee; }
    .payment-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #c9a84c; margin-bottom: 14px; }
    .payment-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .payment-method { display: flex; gap: 8px; font-size: 12px; align-items: flex-start; }
    .pm-label { font-weight: 600; color: #111; min-width: 100px; }
    .pm-value { color: #555; }

    /* Footer */
    .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .thank-you { font-size: 13px; font-weight: 600; color: #111; }
    .footer-note { font-size: 11px; color: #aaa; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page" id="invoicePage">
    <!-- Populated by renderInvoice() -->
  </div>

  <script>
    function fmt(n) {
      return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDate(d) {
      return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    function renderInvoice(data) {
      const hasGmin = data.lineItems.some(i => i.guaranteedMinimum != null);

      const rows = data.lineItems.map(item => `
        <tr>
          <td>${item.leadType}${item.guaranteedMinimum != null ? `<span class="gmin-badge">Min: ${item.guaranteedMinimum}</span>` : ''}</td>
          <td>${item.quantity}</td>
          ${hasGmin ? `<td>${item.guaranteedMinimum != null ? item.guaranteedMinimum : '—'}</td>` : ''}
          <td>${fmt(item.unitPrice)}</td>
          <td>${fmt(item.quantity * item.unitPrice)}</td>
        </tr>
      `).join('');

      const settings = data.settings || {};

      document.getElementById('invoicePage').innerHTML = `
        <div class="header">
          <div>
            <div class="company-name">FUEGO <span>LEADZ</span> LLC</div>
            <div class="company-info">
              5728 Major Blvd, Suite 702<br>
              Orlando, FL 32819<br>
              ${settings.companyEmail || ''}
            </div>
          </div>
          <div class="invoice-meta">
            <div class="invoice-label">INVOICE</div>
            <div class="invoice-detail">
              <strong>Invoice #:</strong> ${data.invoiceNumber}<br>
              <strong>Date:</strong> ${fmtDate(data.date)}<br>
              <strong>EIN:</strong> Applied For
            </div>
          </div>
        </div>

        <div class="bill-section">
          <div>
            <div class="bill-to-label">Bill To</div>
            <div class="bill-to-name">${data.client.first_name} ${data.client.last_name}</div>
            <div class="bill-to-detail">
              ${data.client.email}<br>
              ${data.client.phone}
            </div>
          </div>
          <div class="due-box">
            <div class="due-label">Payment Due</div>
            <div class="due-value">Upon Receipt</div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Lead Type</th>
              <th>Qty</th>
              ${hasGmin ? '<th>Guar. Min</th>' : ''}
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="${hasGmin ? 4 : 3}" style="text-align:right;color:#555;font-size:13px">TOTAL DUE</td>
              <td style="color:#c9a84c;font-size:17px">${fmt(data.totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div class="payment-section">
          <div class="payment-title">Payment Methods</div>
          <div class="payment-methods">
            <div class="payment-method">
              <span class="pm-label">Zelle:</span>
              <span class="pm-value">${settings.paymentZelle || '[Contact for details]'}</span>
            </div>
            <div class="payment-method">
              <span class="pm-label">Bank Transfer:</span>
              <span class="pm-value">${settings.paymentBank || '[Contact for details]'}</span>
            </div>
            <div class="payment-method">
              <span class="pm-label">PayPal:</span>
              <span class="pm-value">${settings.paymentPaypal || '[Contact for details]'}</span>
            </div>
            <div class="payment-method">
              <span class="pm-label">Other:</span>
              <span class="pm-value">${settings.paymentOther || '[Contact for details]'}</span>
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="thank-you">Thank you for your business!</div>
          <div class="footer-note">Fuego Leadz LLC · Florida LLC · L26000085126</div>
        </div>
      `;
    }

    // Listen for data from main process
    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'RENDER_INVOICE') {
        renderInvoice(e.data.payload);
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: invoice HTML template with black/gold professional design"
```

---

## Task 8: PDF Generator + IPC Handler

**Files:**
- Create: `src/pdf-generator.js`
- Modify: `main.js` (add pdf IPC handler)

- [ ] **Step 1: Create src/pdf-generator.js**

```javascript
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { generateInvoiceNumber } = require('./invoice-number');

async function generateInvoicePDF(data) {
  const { client, date, lineItems, totalAmount, saveFolder, sendEmail } = data;

  // Get settings for payment info + company email
  const settings = db.getAllSettings();

  // Generate invoice number
  const seq = db.getNextInvoiceSeq(client.id);
  const invoiceNumber = generateInvoiceNumber(client.last_name, client.first_name, date, seq);

  // Save invoice to DB first
  const invoiceId = db.createInvoice({
    clientId: client.id,
    invoiceNumber,
    invoiceDate: date,
    totalAmount,
    lineItems
  });

  // Build client folder path
  const clientFolderName = `${client.last_name}, ${client.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });

  const pdfPath = path.join(clientFolder, `${invoiceNumber}.pdf`);

  // Render invoice in hidden window
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true }
  });

  const templatePath = path.join(__dirname, '..', 'renderer', 'invoice-template', 'template.html');
  await win.loadFile(templatePath);

  // Send data to template
  await win.webContents.executeJavaScript(`
    renderInvoice(${JSON.stringify({
      client, date, lineItems, totalAmount, invoiceNumber, settings
    })});
  `);

  // Small delay to ensure render completes
  await new Promise(resolve => setTimeout(resolve, 400));

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  win.close();

  fs.writeFileSync(pdfPath, pdfBuffer);
  db.updateInvoicePdfPath(invoiceId, pdfPath);

  return { invoiceId, invoiceNumber, pdfPath, client, sendEmail, settings };
}

module.exports = { generateInvoicePDF };
```

- [ ] **Step 2: Add PDF and shell IPC handlers to main.js**

Add after the existing `ipcMain.handle` block:

```javascript
const { generateInvoicePDF } = require('./src/pdf-generator');
const { sendInvoiceEmail } = require('./src/mailer');

ipcMain.handle('pdf:generate', async (_, data) => {
  const result = await generateInvoicePDF(data);
  if (data.sendEmail) {
    await sendInvoiceEmail(result);
    db.markInvoiceEmailed(result.invoiceId);
  }
  return { success: true, pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: PDF generator using hidden BrowserWindow + printToPDF"
```

---

## Task 9: Email Sender

**Files:**
- Create: `src/mailer.js`
- Modify: `main.js` (add mail:testConnection handler)

- [ ] **Step 1: Create src/mailer.js**

```javascript
const nodemailer = require('nodemailer');
const fs = require('fs');
const db = require('./db');

function getTransport() {
  const settings = db.getAllSettings();
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error('Email not configured. Please set up SMTP in Settings.');
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: settings.smtpUser, pass: settings.smtpPass }
  });
}

async function sendInvoiceEmail({ client, invoiceNumber, pdfPath, settings }) {
  const transport = getTransport();
  const fromName = 'Fuego Leadz LLC';
  const fromEmail = settings.smtpUser;

  await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: client.email,
    subject: `Invoice ${invoiceNumber} from Fuego Leadz LLC`,
    text: `Hi ${client.first_name},\n\nPlease find your invoice ${invoiceNumber} attached.\n\nPayment is due upon receipt.\n\nThank you for your business!\n\nFuego Leadz LLC`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
        <div style="background:#0a0a0a;padding:20px 28px;border-radius:8px 8px 0 0">
          <span style="font-size:20px;font-weight:800;letter-spacing:3px;color:#fff">FUEGO <span style="color:#c9a84c">LEADZ</span> LLC</span>
        </div>
        <div style="padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
          <p>Hi ${client.first_name},</p>
          <p style="margin-top:14px">Please find your invoice <strong>${invoiceNumber}</strong> attached to this email.</p>
          <p style="margin-top:14px;color:#888;font-size:13px">Payment is due upon receipt. If you have any questions, please reply to this email.</p>
          <p style="margin-top:28px">Thank you for your business!</p>
          <p style="margin-top:6px;font-weight:600">Fuego Leadz LLC</p>
        </div>
      </div>
    `,
    attachments: [{
      filename: `${invoiceNumber}.pdf`,
      content: fs.readFileSync(pdfPath)
    }]
  });
}

async function testConnection(config) {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  await transport.verify();
}

module.exports = { sendInvoiceEmail, testConnection };
```

- [ ] **Step 2: Add testConnection handler to main.js**

```javascript
ipcMain.handle('mail:testConnection', async (_, config) => {
  const { testConnection } = require('./src/mailer');
  await testConnection(config);
  return { success: true };
});
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: email sender with invoice attachment and test connection"
```

---

## Task 10: Settings Screen

**Files:**
- Create: `renderer/screens/settings.js`

- [ ] **Step 1: Create renderer/screens/settings.js**

```javascript
export async function settingsScreen(container) {
  const settings = await window.api.settings.getAll();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    <div style="max-width:600px;display:flex;flex-direction:column;gap:20px">

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Invoice Save Folder</h3>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="form-input" id="saveFolder" readonly value="${settings.saveFolder || ''}" placeholder="No folder selected" style="flex:1;cursor:default">
          <button class="btn btn-ghost" id="chooseFolderBtn">Choose Folder</button>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Email Configuration</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Use a Gmail App Password. <a href="#" id="appPassHelp" style="color:var(--gold)">How to create one</a></p>
        <div class="form-group">
          <label class="form-label">Gmail Address</label>
          <input class="form-input" id="smtpUser" type="email" placeholder="fuegoleadz@gmail.com" value="${settings.smtpUser || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">App Password</label>
          <input class="form-input" id="smtpPass" type="password" placeholder="xxxx xxxx xxxx xxxx" value="${settings.smtpPass || ''}">
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn btn-primary" id="saveEmailBtn">Save Email Settings</button>
          <button class="btn btn-ghost" id="testEmailBtn">Test Connection</button>
          <span id="emailStatus" style="font-size:13px"></span>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Company Email (shown on invoice)</h3>
        <div class="form-group">
          <label class="form-label">Company Email</label>
          <input class="form-input" id="companyEmail" placeholder="info@fuegoleadz.com" value="${settings.companyEmail || ''}">
        </div>
        <button class="btn btn-primary" id="saveCompanyBtn">Save</button>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Payment Methods (shown on invoice)</h3>
        <div class="form-group">
          <label class="form-label">Zelle</label>
          <input class="form-input" id="paymentZelle" placeholder="Phone number or email" value="${settings.paymentZelle || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Bank Transfer</label>
          <input class="form-input" id="paymentBank" placeholder="Bank name, Account #, Routing #" value="${settings.paymentBank || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">PayPal</label>
          <input class="form-input" id="paymentPaypal" placeholder="PayPal email or link" value="${settings.paymentPaypal || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Other</label>
          <input class="form-input" id="paymentOther" placeholder="Venmo, Cash App, etc." value="${settings.paymentOther || ''}">
        </div>
        <button class="btn btn-primary" id="savePaymentBtn">Save Payment Methods</button>
      </div>

    </div>
  `;

  document.getElementById('chooseFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder) {
      document.getElementById('saveFolder').value = folder;
      await window.api.settings.set('saveFolder', folder);
      showToast('Save folder updated.', 'success');
    }
  });

  document.getElementById('appPassHelp').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.shell.openPath('https://myaccount.google.com/apppasswords');
  });

  document.getElementById('saveEmailBtn').addEventListener('click', async () => {
    await window.api.settings.set('smtpUser', document.getElementById('smtpUser').value.trim());
    await window.api.settings.set('smtpPass', document.getElementById('smtpPass').value.trim());
    showToast('Email settings saved.', 'success');
  });

  document.getElementById('testEmailBtn').addEventListener('click', async () => {
    const status = document.getElementById('emailStatus');
    status.textContent = 'Testing...';
    status.style.color = 'var(--text-muted)';
    try {
      await window.api.mail.testConnection({
        smtpUser: document.getElementById('smtpUser').value.trim(),
        smtpPass: document.getElementById('smtpPass').value.trim()
      });
      status.textContent = '✓ Connected';
      status.style.color = 'var(--green)';
    } catch (e) {
      status.textContent = '✗ Failed — check credentials';
      status.style.color = 'var(--red)';
    }
  });

  document.getElementById('saveCompanyBtn').addEventListener('click', async () => {
    await window.api.settings.set('companyEmail', document.getElementById('companyEmail').value.trim());
    showToast('Saved.', 'success');
  });

  document.getElementById('savePaymentBtn').addEventListener('click', async () => {
    await window.api.settings.set('paymentZelle', document.getElementById('paymentZelle').value.trim());
    await window.api.settings.set('paymentBank', document.getElementById('paymentBank').value.trim());
    await window.api.settings.set('paymentPaypal', document.getElementById('paymentPaypal').value.trim());
    await window.api.settings.set('paymentOther', document.getElementById('paymentOther').value.trim());
    showToast('Payment methods saved.', 'success');
  });
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
```

- [ ] **Step 2: Launch and test manually**

```bash
npm start
```

Expected:
- Settings screen opens from nav
- "Choose Folder" opens system folder picker
- Email fields accept input, Save saves
- "Test Connection" shows success/fail

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: settings screen with folder, SMTP, company info, payment methods"
```

---

## Task 11: Analytics Dashboard

**Files:**
- Create: `renderer/screens/dashboard.js`

- [ ] **Step 1: Update index.html CSP to allow Chart.js from CDN**

In `renderer/index.html`, the existing CSP meta tag already allows `https://cdn.jsdelivr.net`. No change needed.

- [ ] **Step 2: Create renderer/screens/dashboard.js**

```javascript
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

  // Load Chart.js
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
    const clients = await window.api.db.getClients();
    document.getElementById('summaryCards').innerHTML = `
      <div class="summary-card"><div class="label">All-Time Revenue</div><div class="value">${fmt(totalAllTime)}</div></div>
      <div class="summary-card"><div class="label">This Month</div><div class="value">${fmt(thisMonth.reduce((s,i)=>s+i.total_amount,0))}</div></div>
      <div class="summary-card"><div class="label">Invoices This Month</div><div class="value">${thisMonth.length}</div></div>
      <div class="summary-card"><div class="label">Active Clients</div><div class="value">${allInvoices.length > 0 ? new Set(allInvoices.map(i=>i.client_id)).size : 0}</div></div>
    `;
  }

  let revenueChart, leadChart, clientChart;

  function renderCharts(invoices) {
    renderRevenue(invoices);
    renderLeadTypes(invoices);
    renderTopClients(invoices);
  }

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

  async function refresh() {
    const filtered = filterByRange(allInvoices);
    await renderSummary(filtered);
    renderCharts(filtered);
  }

  // Style active range/period buttons
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

  // Add active button style
  const style = document.createElement('style');
  style.textContent = '.range-btn.active, .period-btn.active { background: var(--gold-dim); color: var(--gold); border-color: var(--gold); }';
  document.head.appendChild(style);

  await refresh();
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
```

- [ ] **Step 3: Fix the async renderSummary (remove async/await inside non-async context)**

The `renderSummary` function above has an error — it calls `window.api.db.getClients()` but is not async-compatible with the current structure. Replace `renderSummary` with this corrected version:

```javascript
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
```

- [ ] **Step 4: Launch and test manually**

```bash
npm start
```

Expected: Analytics screen loads, summary cards show $0.00 with no data, charts render (empty), range/period toggles work. After creating a test invoice, charts show data.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: analytics dashboard with Chart.js revenue, lead type, and client charts"
```

---

## Task 12: Full Integration Test + CLAUDE.md

**Files:**
- Modify: `main.js` (verify all handlers registered)
- Create: `CLAUDE.md`

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass (db.test.js + invoice-number.test.js).

- [ ] **Step 2: Full end-to-end manual test**

```bash
npm start
```

Run through this checklist:
1. Open Settings → choose a save folder (e.g. Desktop/test-invoices)
2. Enter Gmail + App Password → Test Connection → see ✓ Connected
3. Fill in payment methods → Save
4. Go to Clients → Add Client (fill all fields) → client appears in list with red "Overdue" badge
5. Click "New Invoice" on that client
6. Select 2 lead types, fill in qty/price/gmin for each
7. Click "Generate Only" → PDF saved to chosen folder, navigate back to clients
8. Verify client row now shows today's date and green "Up to Date" badge
9. Click "New Invoice" again → select lead types → "Generate & Send Email"
10. Check email inbox for invoice with PDF attachment
11. Open Analytics → verify revenue bars and client chart show data

- [ ] **Step 3: Create CLAUDE.md**

```markdown
# Fuego Leadz Invoice Manager — Claude Context

## What This Is
An Electron desktop app for Fuego Leadz LLC to manage ad leads clients, generate PDF invoices, email them, and visualize revenue.

## Business Details
- **Entity:** Fuego Leadz LLC (FL LLC, Doc# L26000085126)
- **Principal Address:** 5728 Major Blvd, Suite 702, Orlando, FL 32819
- **Payment Terms:** Due upon receipt

## Tech Stack
- Electron 28 (desktop shell)
- better-sqlite3 (local database)
- Nodemailer (email via Gmail SMTP + App Password)
- Chart.js (analytics, loaded from CDN)
- Vanilla JS/HTML/CSS (no framework)
- Jest (unit tests)

## Architecture
- **main.js** — Electron main process, all IPC handlers (db, pdf, mail, settings, dialog)
- **preload.js** — contextBridge exposing window.api to renderer
- **src/db.js** — SQLite schema + all queries
- **src/pdf-generator.js** — renders hidden BrowserWindow, calls printToPDF
- **src/mailer.js** — Nodemailer email + PDF attachment
- **src/invoice-number.js** — INV-YYYY-MMDD-LASTF-SEQ format
- **renderer/app.js** — screen router (navigate(screenName, params))
- **renderer/screens/** — clients, create-invoice, dashboard, settings
- **renderer/invoice-template/template.html** — standalone HTML rendered to PDF

## Lead Products
1. Trucker IUL Leads
2. Spanish IUL Leads
3. Widow of Veteran Leads

## Invoice Number Format
`INV-YYYY-MMDD-[LAST4][FIRST_INITIAL]-[SEQ3]`
Example: `INV-2026-0419-SMITJ-001`
Sequence is per-client (resets at 1 for each new client).

## Data Storage
SQLite at `app.getPath('userData')/fuego-leadz.db`
Tables: clients, invoices, invoice_line_items, settings

## Status Badge Logic
- Green "Up to Date" — last invoice < 6 days ago
- Yellow "Due Soon" — last invoice exactly 6 days ago
- Red "Overdue" — last invoice 7+ days ago, or never invoiced

## Pending
- Add Fuego Leadz logo to invoice header when available
- Fill in payment method details in Settings once decided
- Recurring invoice reminders / auto-send
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: complete Fuego Leadz invoice manager"
```

---

## Run Tests

```bash
npm test
```

Expected output:
```
PASS tests/db.test.js
  ✓ addClient and getClients
  ✓ updateClient updates fields
  ✓ createInvoice saves invoice and line items
  ✓ getSetting and setSetting
  ✓ getNextInvoiceSeq increments per client

PASS tests/invoice-number.test.js
  ✓ generates correct format with last name + first initial
  ✓ pads sequence to 3 digits
  ✓ handles last name shorter than 4 chars
  ✓ strips special characters

Test Suites: 2 passed, 2 total
Tests: 9 passed, 9 total
```
