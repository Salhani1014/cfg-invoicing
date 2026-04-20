# Cloud Sync + Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local SQLite with Supabase PostgreSQL, add per-machine user identity, audit-log every invoice with `created_by`, and make PDFs regenerable from cloud data.

**Architecture:** `src/db.js` is fully rewritten to use `@supabase/supabase-js` — same exported function signatures, now all async. A new `src/user-config.js` stores identity and SMTP credentials locally. `renderer/app.js` gates launch behind an identity check and schema version check. All existing screens continue working; only `invoices.js` and `settings.js` gain new UI elements.

**Tech Stack:** Electron 28, `@supabase/supabase-js` ^2, `electron-updater` ^6, Nodemailer, vanilla JS/HTML/CSS, Jest.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/supabase.js` | Create | Supabase URL + anon key constants |
| `src/user-config.js` | Create | Local identity + SMTP credentials read/write |
| `src/db.js` | Full rewrite | `better-sqlite3` → Supabase client; all functions now async; add `getClientById`, `getSchemaVersion` |
| `src/mailer.js` | Modify | Read SMTP from `userConfig.getConfig()` instead of `settings` argument |
| `src/pdf-generator.js` | Modify | Await all db calls; extract `renderToPDF` helper; add `regenerateInvoicePDF` |
| `renderer/screens/setup.js` | Create | First-launch identity + SMTP + folder setup screen |
| `renderer/app.js` | Modify | `init()` checks schema version then identity before navigating |
| `renderer/screens/settings.js` | Modify | Add User Settings card at top; remove SMTP from global settings card |
| `renderer/screens/invoices.js` | Modify | Download PDF button; `created_by` badge; "Created By" filter |
| `main.js` | Modify | Await async db calls; add `userConfig.*`, `pdf:regenerate`, `db:getSchemaVersion` IPC; add `electron-updater` |
| `preload.js` | Modify | Expose `window.api.userConfig.*`, `window.api.pdf.regenerate`, `window.api.db.getSchemaVersion` |
| `package.json` | Modify | Add `@supabase/supabase-js`, `electron-updater`; add `publish` config |
| `tests/user-config.test.js` | Create | Unit tests for user-config module |
| `tests/db.test.js` | Delete | SQLite-specific tests no longer apply |
| `scripts/migrate-to-supabase.js` | Create | One-time migration from local SQLite to Supabase |

---

## Task 1: Supabase Project Setup + Schema

**Files:** None (manual steps in Supabase dashboard)

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com → New project → name it `cfg-invoicing` → choose a region close to Florida → set a database password and save it somewhere safe.

- [ ] **Step 2: Run the schema SQL**

In the Supabase dashboard → SQL Editor → New query → paste and run:

```sql
-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER NOT NULL REFERENCES clients(id),
  invoice_number   TEXT NOT NULL UNIQUE,
  invoice_date     TEXT NOT NULL,
  total_amount     NUMERIC(10,2) NOT NULL,
  pdf_path         TEXT,
  emailed          BOOLEAN NOT NULL DEFAULT FALSE,
  paid             BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at          TEXT,
  payment_method   TEXT,
  reminder_sent_at TEXT,
  notes            TEXT,
  invoice_type     TEXT NOT NULL DEFAULT 'lead',
  created_by       TEXT NOT NULL DEFAULT 'braxton',
  created_at       TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);

-- Line items
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id                  SERIAL PRIMARY KEY,
  invoice_id          INTEGER NOT NULL REFERENCES invoices(id),
  lead_type           TEXT NOT NULL,
  quantity            INTEGER NOT NULL,
  unit_price          NUMERIC(10,2) NOT NULL,
  guaranteed_minimum  INTEGER
);

-- Settings (global key-value)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Seed schema version
INSERT INTO settings (key, value) VALUES ('schemaVersion', '1')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Create RPC functions for atomic operations**

In SQL Editor → New query → paste and run:

```sql
-- Atomic invoice + line items insert
CREATE OR REPLACE FUNCTION create_invoice_with_items(
  p_client_id      INTEGER,
  p_invoice_number TEXT,
  p_invoice_date   TEXT,
  p_total_amount   NUMERIC,
  p_payment_method TEXT,
  p_invoice_type   TEXT,
  p_created_by     TEXT,
  p_line_items     JSONB
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_id INTEGER;
BEGIN
  INSERT INTO invoices (client_id, invoice_number, invoice_date, total_amount,
                        payment_method, invoice_type, created_by)
  VALUES (p_client_id, p_invoice_number, p_invoice_date, p_total_amount,
          p_payment_method, p_invoice_type, p_created_by)
  RETURNING id INTO v_id;

  INSERT INTO invoice_line_items (invoice_id, lead_type, quantity, unit_price, guaranteed_minimum)
  SELECT v_id,
         item->>'lead_type',
         (item->>'quantity')::INTEGER,
         (item->>'unit_price')::NUMERIC,
         CASE WHEN item->>'guaranteed_minimum' IS NULL OR item->>'guaranteed_minimum' = 'null'
              THEN NULL ELSE (item->>'guaranteed_minimum')::INTEGER END
  FROM jsonb_array_elements(p_line_items) AS item;

  RETURN v_id;
END;
$$;

-- Cascade delete client
CREATE OR REPLACE FUNCTION delete_client_cascade(p_client_id INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM invoice_line_items
  WHERE invoice_id IN (SELECT id FROM invoices WHERE client_id = p_client_id);
  DELETE FROM invoices WHERE client_id = p_client_id;
  DELETE FROM clients WHERE id = p_client_id;
END;
$$;

-- Cascade delete invoice
CREATE OR REPLACE FUNCTION delete_invoice_cascade(p_invoice_id INTEGER)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;
  DELETE FROM invoices WHERE id = p_invoice_id;
END;
$$;
```

- [ ] **Step 4: Collect your credentials**

In Supabase dashboard → Project Settings → API:
- Copy **Project URL** (looks like `https://xyzxyzxyz.supabase.co`)
- Copy **anon public** key (long JWT string)

You'll paste these into `src/supabase.js` in the next task.

- [ ] **Step 5: Disable Row Level Security on all tables**

In Supabase dashboard → Table Editor → for each table (`clients`, `invoices`, `invoice_line_items`, `settings`):
- Click the table → RLS → toggle RLS off (or leave off, it's off by default for new projects)

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new packages**

```bash
cd /Users/braxtonmondell/fuego-leadz
npm install @supabase/supabase-js electron-updater
```

Expected: both packages appear in `node_modules/` and `package.json` dependencies.

- [ ] **Step 2: Add publish config to package.json**

Open `package.json`. Find the `"build"` section and add a `"publish"` key inside `"build"`:

```json
"publish": {
  "provider": "github",
  "owner": "checkmatefinancialgroup",
  "repo": "cfg-invoicing"
}
```

The full `"build"` section should now end with that `"publish"` block before its closing `}`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add supabase and electron-updater dependencies"
```

---

## Task 3: src/supabase.js + src/user-config.js

**Files:**
- Create: `src/supabase.js`
- Create: `src/user-config.js`
- Create: `tests/user-config.test.js`

- [ ] **Step 1: Write the user-config tests (they will fail — no implementation yet)**

Create `tests/user-config.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-user-config-'));
  process.env.USER_CONFIG_DIR = tmpDir;
  jest.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.USER_CONFIG_DIR;
});

function load() {
  return require('../src/user-config');
}

test('isConfigured returns false when no file exists', () => {
  expect(load().isConfigured()).toBe(false);
});

test('getConfig returns null when no file exists', () => {
  expect(load().getConfig()).toBeNull();
});

test('saveConfig + getConfig round-trips', () => {
  const { saveConfig, getConfig } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx xxxx', saveFolder: '/tmp/inv' });
  const cfg = getConfig();
  expect(cfg.user).toBe('braxton');
  expect(cfg.smtpUser).toBe('b@cfg.com');
  expect(cfg.smtpPass).toBe('xxxx xxxx');
  expect(cfg.saveFolder).toBe('/tmp/inv');
});

test('isConfigured returns true after complete config is saved', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx xxxx', saveFolder: '/tmp/inv' });
  expect(isConfigured()).toBe(true);
});

test('isConfigured returns false if smtpPass is empty', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: '', saveFolder: '/tmp/inv' });
  expect(isConfigured()).toBe(false);
});

test('isConfigured returns false if saveFolder is missing', () => {
  const { saveConfig, isConfigured } = load();
  saveConfig({ user: 'braxton', smtpUser: 'b@cfg.com', smtpPass: 'xxxx' });
  expect(isConfigured()).toBe(false);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest tests/user-config.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/user-config'`

- [ ] **Step 3: Create src/supabase.js**

Replace `YOUR_SUPABASE_URL` and `YOUR_ANON_KEY` with the values you collected in Task 1 Step 4:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

module.exports = { SUPABASE_URL, SUPABASE_ANON_KEY };
```

- [ ] **Step 4: Create src/user-config.js**

```javascript
const fs = require('fs');
const path = require('path');

function getConfigPath() {
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'user-config.json');
  } catch (_) {
    return path.join(process.env.USER_CONFIG_DIR || '/tmp', 'user-config.json');
  }
}

function getConfig() {
  const p = getConfigPath();
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function saveConfig(data) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2));
}

function isConfigured() {
  const cfg = getConfig();
  return !!(cfg && cfg.user && cfg.smtpUser && cfg.smtpPass && cfg.saveFolder);
}

module.exports = { getConfig, saveConfig, isConfigured };
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx jest tests/user-config.test.js --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/supabase.js src/user-config.js tests/user-config.test.js
git commit -m "feat: add supabase constants and local user-config module"
```

---

## Task 4: src/db.js Rewrite

**Files:**
- Modify: `src/db.js` (full replacement)
- Delete: `tests/db.test.js`

- [ ] **Step 1: Delete the old SQLite-based db tests**

```bash
rm -f tests/db.test.js
```

The old tests required `better-sqlite3` directly and tested SQLite internals. Supabase integration requires a live network connection and is verified by running the app.

- [ ] **Step 2: Replace src/db.js entirely**

```javascript
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Clients ────────────────────────────────────────────────────────────────

async function getClients() {
  const [{ data: clients, error: ce }, { data: invoices, error: ie }] = await Promise.all([
    supabase.from('clients').select('*').order('last_name').order('first_name'),
    supabase.from('invoices').select('id, client_id, invoice_date, total_amount, paid')
  ]);
  if (ce) throw ce;
  if (ie) throw ie;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return (clients || []).map(c => {
    const ci = (invoices || []).filter(i => i.client_id === c.id);
    const sorted = [...ci].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const last = sorted[0];
    const overdue_count = ci.filter(i => !i.paid && i.invoice_date <= cutoffStr).length;
    const total_unpaid = ci.filter(i => !i.paid).reduce((s, i) => s + Number(i.total_amount), 0);
    return { ...c, last_invoice_date: last?.invoice_date || null, last_invoice_amount: last?.total_amount || null, overdue_count, total_unpaid };
  });
}

async function addClient(data) {
  const { data: row, error } = await supabase
    .from('clients')
    .insert({ first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone })
    .select('id').single();
  if (error) throw error;
  return row.id;
}

async function updateClient(id, data) {
  const { error } = await supabase
    .from('clients')
    .update({ first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone })
    .eq('id', id);
  if (error) throw error;
}

async function deleteClient(id) {
  const { error } = await supabase.rpc('delete_client_cascade', { p_client_id: id });
  if (error) throw error;
}

async function getClientById(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

async function createInvoice(data) {
  const { data: result, error } = await supabase.rpc('create_invoice_with_items', {
    p_client_id:      data.clientId,
    p_invoice_number: data.invoiceNumber,
    p_invoice_date:   data.invoiceDate,
    p_total_amount:   data.totalAmount,
    p_payment_method: data.paymentMethod || null,
    p_invoice_type:   data.invoiceType || 'lead',
    p_created_by:     data.createdBy || 'braxton',
    p_line_items:     data.lineItems.map(li => ({
      lead_type:          li.leadType,
      quantity:           li.quantity,
      unit_price:         li.unitPrice,
      guaranteed_minimum: li.guaranteedMinimum || null
    }))
  });
  if (error) throw error;
  return result;
}

async function updateInvoicePdfPath(id, pdfPath) {
  const { error } = await supabase.from('invoices').update({ pdf_path: pdfPath }).eq('id', id);
  if (error) throw error;
}

async function markInvoiceEmailed(id) {
  const { error } = await supabase.from('invoices').update({ emailed: true }).eq('id', id);
  if (error) throw error;
}

async function getInvoices(clientId) {
  const { data: invoices, error } = await supabase
    .from('invoices').select('*').eq('client_id', clientId).order('invoice_date', { ascending: false });
  if (error) throw error;
  if (!invoices || !invoices.length) return [];

  const { data: lineItems } = await supabase
    .from('invoice_line_items').select('invoice_id, lead_type')
    .in('invoice_id', invoices.map(i => i.id));

  const ltByInvoice = {};
  for (const li of (lineItems || [])) {
    if (!ltByInvoice[li.invoice_id]) ltByInvoice[li.invoice_id] = [];
    ltByInvoice[li.invoice_id].push(li.lead_type);
  }
  return invoices.map(inv => ({ ...inv, lead_types: (ltByInvoice[inv.id] || []).join(',') }));
}

async function getAllInvoices() {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email)')
    .order('invoice_date', { ascending: false });
  if (error) throw error;

  const { data: lineItems } = await supabase.from('invoice_line_items').select('*');

  const liByInvoice = {};
  for (const li of (lineItems || [])) {
    if (!liByInvoice[li.invoice_id]) liByInvoice[li.invoice_id] = [];
    liByInvoice[li.invoice_id].push(li);
  }

  return (invoices || []).map(inv => ({
    ...inv,
    first_name: inv.clients.first_name,
    last_name:  inv.clients.last_name,
    email:      inv.clients.email,
    line_items_raw: (liByInvoice[inv.id] || [])
      .map(li => `${li.lead_type}\x1f${li.quantity}\x1f${li.unit_price}\x1f${li.guaranteed_minimum || ''}`)
      .join(',')
  }));
}

async function getNextInvoiceSeq(clientId) {
  const { count } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true }).eq('client_id', clientId);
  return (count || 0) + 1;
}

async function getLastClientInvoice(clientId) {
  const { data: invoices } = await supabase
    .from('invoices').select('*').eq('client_id', clientId)
    .order('invoice_date', { ascending: false }).limit(1);
  const invoice = invoices?.[0];
  if (!invoice) return null;

  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('lead_type, quantity, unit_price, guaranteed_minimum')
    .eq('invoice_id', invoice.id);

  return {
    ...invoice,
    lineItems: (lineItems || []).map(li => ({
      leadType: li.lead_type, quantity: li.quantity,
      unitPrice: li.unit_price, guaranteedMinimum: li.guaranteed_minimum
    }))
  };
}

async function markReminderSent(id) {
  const { error } = await supabase
    .from('invoices').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function updateInvoiceNotes(id, notes) {
  const { error } = await supabase
    .from('invoices').update({ notes: notes || null }).eq('id', id);
  if (error) throw error;
}

async function getOverdueInvoices(days = 7) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email, phone)')
    .eq('paid', false).is('reminder_sent_at', null);
  if (error) throw error;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return (data || [])
    .filter(inv => inv.invoice_date <= cutoffStr)
    .map(inv => ({
      ...inv,
      first_name: inv.clients.first_name, last_name: inv.clients.last_name,
      email: inv.clients.email, phone: inv.clients.phone
    }));
}

async function markInvoicePaid(id) {
  const { error } = await supabase
    .from('invoices').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function deleteInvoice(id) {
  const { error } = await supabase.rpc('delete_invoice_cascade', { p_invoice_id: id });
  if (error) throw error;
}

async function getInvoiceById(id) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email, phone)')
    .eq('id', id).single();
  if (error) throw error;

  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('lead_type, quantity, unit_price, guaranteed_minimum')
    .eq('invoice_id', id);

  return {
    ...invoice,
    first_name: invoice.clients.first_name, last_name: invoice.clients.last_name,
    email: invoice.clients.email, phone: invoice.clients.phone,
    lineItems: (lineItems || []).map(li => ({
      leadType: li.lead_type, quantity: li.quantity,
      unitPrice: li.unit_price, guaranteedMinimum: li.guaranteed_minimum
    }))
  };
}

// ─── Settings ───────────────────────────────────────────────────────────────

async function getSetting(key) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).single();
  return data?.value || null;
}

async function setSetting(key, value) {
  const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function getAllSettings() {
  const { data } = await supabase.from('settings').select('key, value');
  return (data || []).reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
}

async function getSchemaVersion() {
  const { data } = await supabase.from('settings').select('value').eq('key', 'schemaVersion').single();
  return data ? Number(data.value) : 0;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function closeDb() { /* no-op: Supabase is stateless */ }

module.exports = {
  getClients, addClient, updateClient, deleteClient, getClientById,
  createInvoice, updateInvoicePdfPath, markInvoiceEmailed,
  markInvoicePaid, deleteInvoice, getInvoiceById,
  getLastClientInvoice, markReminderSent, updateInvoiceNotes, getOverdueInvoices,
  getInvoices, getAllInvoices, getNextInvoiceSeq,
  getSetting, setSetting, getAllSettings, getSchemaVersion,
  closeDb
};
```

- [ ] **Step 3: Verify the invoice-number tests still pass**

```bash
npx jest tests/invoice-number.test.js --no-coverage
```

Expected: PASS — 7 tests passing. (The db tests are gone; the invoice-number tests remain valid.)

- [ ] **Step 4: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat: rewrite db.js to use Supabase client, drop better-sqlite3"
```

---

## Task 5: src/mailer.js + src/pdf-generator.js

**Files:**
- Modify: `src/mailer.js`
- Modify: `src/pdf-generator.js`

- [ ] **Step 1: Replace src/mailer.js**

```javascript
const nodemailer = require('nodemailer');
const fs = require('fs');
const userConfig = require('./user-config');

function makeTransport(smtpUser, smtpPass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

function getSmtp() {
  const cfg = userConfig.getConfig();
  if (!cfg?.smtpUser || !cfg?.smtpPass) {
    throw new Error('Email not configured. Please run setup first.');
  }
  return { smtpUser: cfg.smtpUser, smtpPass: cfg.smtpPass };
}

async function sendInvoiceEmail({ client, invoiceNumber, pdfPath, settings }) {
  const { smtpUser, smtpPass } = getSmtp();
  const transport = makeTransport(smtpUser, smtpPass);
  await transport.sendMail({
    from: `"Checkmate Financial Group LLC" <${smtpUser}>`,
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
          <p style="margin-top:14px;color:#888;font-size:13px">Payment is due upon receipt.</p>
          <p style="margin-top:28px">Thank you for your business!</p>
          <p style="margin-top:6px;font-weight:600">Checkmate Financial Group LLC</p>
        </div>
      </div>`,
    attachments: [{ filename: `${invoiceNumber}.pdf`, content: await fs.promises.readFile(pdfPath) }]
  });
}

async function sendPaidReceipt({ client, invoiceNumber, pdfPath, settings }) {
  const { smtpUser, smtpPass } = getSmtp();
  const transport = makeTransport(smtpUser, smtpPass);
  await transport.sendMail({
    from: `"Checkmate Financial Group LLC" <${smtpUser}>`,
    to: client.email,
    subject: `Payment Received — Invoice ${invoiceNumber}`,
    text: `Hi ${client.first_name},\n\nWe've received your payment for Invoice #${invoiceNumber}. Please find your receipt attached.\n\nThank you!\n\nCheckmate Financial Group LLC`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
        <div style="background:#0a0a0a;padding:20px 28px;border-radius:8px 8px 0 0">
          <span style="font-size:18px;font-weight:800;letter-spacing:2px;color:#fff">CHECKMATE <span style="color:#c9a84c">FINANCIAL GROUP</span> LLC</span>
        </div>
        <div style="padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
          <p>Hi ${client.first_name},</p>
          <p style="margin-top:14px">We've received your payment for Invoice <strong>#${invoiceNumber}</strong>. Receipt attached.</p>
          <div style="margin-top:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px;color:#166534;font-weight:600">✓ Payment Received — Thank you!</div>
          <p style="margin-top:28px">Thank you for your business!</p>
          <p style="margin-top:6px;font-weight:600">Checkmate Financial Group LLC</p>
        </div>
      </div>`,
    attachments: [{ filename: `${invoiceNumber}-paid.pdf`, content: await fs.promises.readFile(pdfPath) }]
  });
}

async function sendReminderEmail({ client, invoiceNumber, invoiceDate, totalAmount, settings }) {
  const { smtpUser, smtpPass } = getSmtp();
  const transport = makeTransport(smtpUser, smtpPass);
  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const fmtAmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await transport.sendMail({
    from: `"Checkmate Financial Group LLC" <${smtpUser}>`,
    to: client.email,
    subject: `Reminder: Invoice ${invoiceNumber} — Payment Due`,
    text: `Hi ${client.first_name},\n\nThis is a friendly reminder that Invoice #${invoiceNumber} dated ${fmtDate(invoiceDate)} for ${fmtAmt(totalAmount)} remains unpaid.\n\nThank you!\nCheckmate Financial Group LLC`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
        <div style="background:#0a0a0a;padding:20px 28px;border-radius:8px 8px 0 0">
          <span style="font-size:18px;font-weight:800;letter-spacing:2px;color:#fff">CHECKMATE <span style="color:#c9a84c">FINANCIAL GROUP</span> LLC</span>
        </div>
        <div style="padding:28px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
          <p>Hi ${client.first_name},</p>
          <p style="margin-top:14px">This is a friendly reminder that the following invoice remains unpaid:</p>
          <div style="margin:18px 0;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px">
            <div style="font-size:12px;color:#888;margin-bottom:2px">Invoice #</div>
            <div style="font-size:15px;font-weight:700;color:#c9a84c">${invoiceNumber}</div>
            <div style="margin-top:10px;font-size:12px;color:#888">Date</div>
            <div style="font-weight:600">${fmtDate(invoiceDate)}</div>
            <div style="margin-top:10px;font-size:12px;color:#888">Amount Due</div>
            <div style="font-size:18px;font-weight:700;color:#e03131">${fmtAmt(totalAmount)}</div>
          </div>
          <p>Please send payment at your earliest convenience.</p>
          <p style="margin-top:28px">Thank you!</p>
          <p style="margin-top:6px;font-weight:600">Checkmate Financial Group LLC</p>
        </div>
      </div>`
  });
}

async function testConnection(config) {
  const transport = makeTransport(config.smtpUser, config.smtpPass);
  await transport.verify();
}

module.exports = { sendInvoiceEmail, sendPaidReceipt, sendReminderEmail, testConnection };
```

- [ ] **Step 2: Replace src/pdf-generator.js**

```javascript
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { generateInvoiceNumber } = require('./invoice-number');
const userConfig = require('./user-config');

async function renderToPDF(data) {
  const logoPath = path.join(__dirname, '..', 'renderer', 'assets', 'logo.png');
  let logoBase64 = '';
  try { logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64'); } catch (_) {}

  const win = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { contextIsolation: true }
  });
  const templatePath = path.join(__dirname, '..', 'renderer', 'invoice-template', 'template.html');
  try {
    await win.loadFile(templatePath);
    const payload = JSON.stringify({ ...data, logoBase64 });
    await win.webContents.executeJavaScript(
      `window.__inv = JSON.parse(${JSON.stringify(payload)}); renderInvoice(window.__inv);`
    );
    await new Promise(r => setTimeout(r, 400));
    return await win.webContents.printToPDF({
      printBackground: true, pageSize: 'Letter',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
  } finally {
    if (!win.isDestroyed()) win.close();
  }
}

async function generateInvoicePDF(data) {
  const { client, date, lineItems, totalAmount, saveFolder, sendEmail } = data;

  const [settings, invoiceNumber] = [
    await db.getAllSettings(),
    generateInvoiceNumber(client.last_name, client.first_name, date)
  ];
  const config = userConfig.getConfig();

  const invoiceId = await db.createInvoice({
    clientId: client.id, invoiceNumber, invoiceDate: date, totalAmount, lineItems,
    paymentMethod: data.paymentMethod || 'paymentZelle',
    invoiceType: data.invoiceType || 'lead',
    createdBy: config?.user || 'braxton'
  });

  const clientFolderName = `${client.last_name}, ${client.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });
  const pdfPath = path.join(clientFolder, `${invoiceNumber}.pdf`);

  const pdfBuffer = await renderToPDF({
    client, date, lineItems, totalAmount, invoiceNumber, settings,
    paymentMethod: data.paymentMethod || 'paymentZelle',
    invoiceType: data.invoiceType || 'lead',
    paid: false
  });

  fs.writeFileSync(pdfPath, pdfBuffer);
  await db.updateInvoicePdfPath(invoiceId, pdfPath);

  return { invoiceId, invoiceNumber, pdfPath, client, sendEmail, settings };
}

async function generatePaidPDF({ invoiceId, saveFolder }) {
  const [invoice, settings] = await Promise.all([db.getInvoiceById(invoiceId), db.getAllSettings()]);
  if (!invoice) throw new Error('Invoice not found');

  const client = { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email, phone: invoice.phone };
  const clientFolderName = `${invoice.last_name}, ${invoice.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });
  const pdfPath = path.join(clientFolder, `${invoice.invoice_number}-paid.pdf`);

  const pdfBuffer = await renderToPDF({
    client, date: invoice.invoice_date, lineItems: invoice.lineItems,
    totalAmount: invoice.total_amount, invoiceNumber: invoice.invoice_number,
    settings, paymentMethod: invoice.payment_method || 'paymentZelle',
    invoiceType: invoice.invoice_type || 'lead', paid: true
  });

  fs.writeFileSync(pdfPath, pdfBuffer);
  await db.markInvoicePaid(invoiceId);
  return { pdfPath, invoiceNumber: invoice.invoice_number, client };
}

async function regenerateInvoicePDF(invoiceId, saveFolder) {
  const [invoice, settings] = await Promise.all([db.getInvoiceById(invoiceId), db.getAllSettings()]);
  if (!invoice) throw new Error('Invoice not found');

  const client = { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email, phone: invoice.phone };
  const clientFolderName = `${invoice.last_name}, ${invoice.first_name}`.replace(/[^a-zA-Z0-9, ]/g, '');
  const clientFolder = path.join(saveFolder, clientFolderName);
  fs.mkdirSync(clientFolder, { recursive: true });
  const suffix = invoice.paid ? '-paid' : '';
  const pdfPath = path.join(clientFolder, `${invoice.invoice_number}${suffix}.pdf`);

  const pdfBuffer = await renderToPDF({
    client, date: invoice.invoice_date, lineItems: invoice.lineItems,
    totalAmount: invoice.total_amount, invoiceNumber: invoice.invoice_number,
    settings, paymentMethod: invoice.payment_method || 'paymentZelle',
    invoiceType: invoice.invoice_type || 'lead', paid: !!invoice.paid
  });

  fs.writeFileSync(pdfPath, pdfBuffer);
  return { pdfPath, invoiceNumber: invoice.invoice_number };
}

module.exports = { generateInvoicePDF, generatePaidPDF, regenerateInvoicePDF };
```

- [ ] **Step 3: Commit**

```bash
git add src/mailer.js src/pdf-generator.js
git commit -m "feat: mailer reads SMTP from userConfig; pdf-generator awaits db, adds regenerate"
```

---

## Task 6: renderer/screens/setup.js

**Files:**
- Create: `renderer/screens/setup.js`

- [ ] **Step 1: Create renderer/screens/setup.js**

```javascript
export async function setupScreen(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px">
      <div class="card" style="max-width:460px;width:100%">
        <div style="text-align:center;margin-bottom:28px">
          <h1 style="font-size:22px;font-weight:700;color:var(--gold);margin-bottom:8px">Welcome to CFG Invoicing</h1>
          <p style="color:var(--text-muted);font-size:14px">Set up your identity on this machine. You only need to do this once.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Who are you?</label>
          <select class="form-select" id="setupUser">
            <option value="">Select...</option>
            <option value="braxton">Braxton Mondell</option>
            <option value="obada">Obada</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Gmail App Password</label>
          <input type="password" class="form-input" id="setupSmtpPass" placeholder="xxxx xxxx xxxx xxxx">
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">16-character App Password for your CFG email — not your regular Gmail password.</div>
        </div>

        <div class="form-group">
          <label class="form-label">PDF Save Folder</label>
          <div style="display:flex;gap:8px">
            <input type="text" class="form-input" id="setupFolder" placeholder="Click Browse to select..." readonly style="flex:1;cursor:pointer">
            <button class="btn btn-ghost" id="setupFolderBtn">Browse</button>
          </div>
        </div>

        <div id="setupError" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none"></div>

        <button class="btn btn-primary" id="setupSaveBtn" style="width:100%">Save &amp; Continue</button>
      </div>
    </div>
  `;

  const SMTP_USERS = {
    braxton: 'braxton@checkmatefinancialgroup.com',
    obada: 'obada@checkmatefinancialgroup.com'
  };

  container.querySelector('#setupFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder) container.querySelector('#setupFolder').value = folder;
  });

  container.querySelector('#setupSaveBtn').addEventListener('click', async () => {
    const err = container.querySelector('#setupError');
    err.style.display = 'none';

    const user = container.querySelector('#setupUser').value;
    const smtpPass = container.querySelector('#setupSmtpPass').value.trim();
    const saveFolder = container.querySelector('#setupFolder').value;

    if (!user)       { err.textContent = 'Please select who you are.'; err.style.display = 'block'; return; }
    if (!smtpPass)   { err.textContent = 'Please enter your Gmail App Password.'; err.style.display = 'block'; return; }
    if (!saveFolder) { err.textContent = 'Please select a PDF save folder.'; err.style.display = 'block'; return; }

    await window.api.userConfig.save({ user, smtpUser: SMTP_USERS[user], smtpPass, saveFolder });
    window.navigate('clients');
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/screens/setup.js
git commit -m "feat: add first-launch identity setup screen"
```

---

## Task 7: renderer/app.js Update

**Files:**
- Modify: `renderer/app.js`

- [ ] **Step 1: Replace renderer/app.js entirely**

```javascript
const REQUIRED_SCHEMA_VERSION = 1;

const screenLoaders = {
  clients:        () => import('./screens/clients.js').then(m => m.clientsScreen),
  'create-invoice': () => import('./screens/create-invoice.js').then(m => m.createInvoiceScreen),
  'batch-invoice':  () => import('./screens/bulk-invoice.js').then(m => m.batchInvoiceScreen),
  invoices:       () => import('./screens/invoices.js').then(m => m.invoicesScreen),
  dashboard:      () => import('./screens/dashboard.js').then(m => m.dashboardScreen),
  settings:       () => import('./screens/settings.js').then(m => m.settingsScreen),
  setup:          () => import('./screens/setup.js').then(m => m.setupScreen),
};

async function navigate(screenName, params = {}) {
  if (!screenName) return;
  const isUtil = screenName === 'setup';
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
  if (!isUtil) updateUnpaidBadge();
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
  link.addEventListener('click', e => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

window.navigate = navigate;
window.updateUnpaidBadge = updateUnpaidBadge;

async function init() {
  const container = document.getElementById('screen-container');

  // Schema version check — blocks launch if app is outdated
  try {
    const version = await window.api.db.getSchemaVersion();
    if (version > REQUIRED_SCHEMA_VERSION) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
          <div style="text-align:center;max-width:400px">
            <h2 style="color:var(--gold);margin-bottom:12px">Update Required</h2>
            <p style="color:var(--text-muted)">A newer version of CFG Invoicing is required to connect to the database. Please download the latest version.</p>
          </div>
        </div>`;
      return;
    }
  } catch (e) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
        <div style="text-align:center;max-width:400px">
          <h2 style="color:var(--red);margin-bottom:12px">Cannot Connect</h2>
          <p style="color:var(--text-muted)">Unable to reach the database. Check your internet connection and restart the app.</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:8px">${e.message}</p>
        </div>
      </div>`;
    return;
  }

  // Identity check — shows setup screen on first launch
  const configured = await window.api.userConfig.isConfigured();
  if (!configured) {
    navigate('setup');
    return;
  }

  navigate('clients');
}

init();
```

- [ ] **Step 2: Start the app to verify the connection + setup flow**

```bash
cd /Users/braxtonmondell/fuego-leadz && npm start
```

Expected:
- If the Supabase URL and key are correct: the setup screen appears (since user-config.json doesn't exist yet)
- Fill in the setup form and click "Save & Continue" — the clients screen loads
- On next launch: goes straight to clients screen

If you see "Cannot Connect": the Supabase URL or anon key in `src/supabase.js` is wrong.

- [ ] **Step 3: Commit**

```bash
git add renderer/app.js
git commit -m "feat: app.js gates launch on schema version check and identity check"
```

---

## Task 8: renderer/screens/settings.js Update

**Files:**
- Modify: `renderer/screens/settings.js`

- [ ] **Step 1: Read the current file to understand its structure**

```bash
cat renderer/screens/settings.js
```

- [ ] **Step 2: Add the User Settings card at the top**

Find the `settingsScreen` function. Before the first existing card's HTML (which starts the company/SMTP section), prepend this User Settings card:

```javascript
  // Load local user config
  const userCfg = await window.api.userConfig.getConfig() || {};
  const USER_LABELS = { braxton: 'Braxton Mondell', obada: 'Obada' };

  // Prepend to the HTML content — this card comes first
  const userSettingsCard = `
    <div class="card" style="margin-bottom:20px">
      <h3 style="font-size:15px;font-weight:600;margin-bottom:16px;color:var(--gold)">User Settings</h3>
      <div class="form-group">
        <label class="form-label">Current User</label>
        <div style="font-size:14px;font-weight:600;padding:8px 0">${USER_LABELS[userCfg.user] || userCfg.user || '—'}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Gmail App Password</label>
        <input type="password" class="form-input" id="userSmtpPass" value="${userCfg.smtpPass || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">PDF Save Folder</label>
        <div style="display:flex;gap:8px">
          <input type="text" class="form-input" id="userSaveFolder" value="${userCfg.saveFolder || ''}" readonly style="flex:1;cursor:pointer">
          <button class="btn btn-ghost" id="userFolderBtn">Browse</button>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="saveUserSettingsBtn">Save User Settings</button>
      <span id="userSettingsSaved" style="margin-left:12px;color:var(--green);font-size:13px;display:none">Saved!</span>
    </div>
  `;
```

- [ ] **Step 3: Wire the User Settings card event handlers**

After the card HTML is injected into the DOM, add:

```javascript
  container.querySelector('#userFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder) container.querySelector('#userSaveFolder').value = folder;
  });

  container.querySelector('#saveUserSettingsBtn').addEventListener('click', async () => {
    const smtpPass = container.querySelector('#userSmtpPass').value.trim();
    const saveFolder = container.querySelector('#userSaveFolder').value;
    await window.api.userConfig.save({ ...userCfg, smtpPass, saveFolder });
    const saved = container.querySelector('#userSettingsSaved');
    saved.style.display = 'inline';
    setTimeout(() => { saved.style.display = 'none'; }, 2000);
  });
```

- [ ] **Step 4: Remove SMTP fields from the global settings card**

Find the inputs for `smtpUser` and `smtpPass` in the global settings card (they're in the company/SMTP section) and delete those two form-group blocks. The global card should keep: company name, company email, company address, payment method details, overdue reminders.

- [ ] **Step 5: Start the app and verify Settings screen**

- Open Settings → confirm "User Settings" card is at the top with your name displayed
- Edit App Password → Save → confirm it sticks across a reload
- Confirm the SMTP fields are gone from the main settings card

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/settings.js
git commit -m "feat: add User Settings card, remove SMTP from global settings"
```

---

## Task 9: renderer/screens/invoices.js Update

**Files:**
- Modify: `renderer/screens/invoices.js`

- [ ] **Step 1: Add the "Created By" filter variable**

At the top of the `invoicesScreen` function, alongside existing filter state variables (`let statusFilter = 'all'`, etc.), add:

```javascript
  let createdByFilter = 'all';
```

- [ ] **Step 2: Add the "Created By" dropdown to the filter bar**

Find where the filter bar HTML is rendered (the `<select id="leadTypeFilter">` and status filter). Add this dropdown alongside the others:

```javascript
          <select id="createdByFilter" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer">
            <option value="all">All Users</option>
            <option value="braxton">Braxton</option>
            <option value="obada">Obada</option>
          </select>
```

- [ ] **Step 3: Wire the "Created By" filter**

Find where other filter change listeners are wired (e.g. `#leadTypeFilter` change handler). Add:

```javascript
    container.querySelector('#createdByFilter').addEventListener('change', e => {
      createdByFilter = e.target.value;
      render();
    });
```

- [ ] **Step 4: Update getFiltered() to apply the createdBy filter**

Find the `getFiltered()` function. It already filters by `statusFilter`, `leadTypeFilter`, `searchQuery`. Add one more condition:

```javascript
      const matchesCreatedBy = createdByFilter === 'all' || inv.created_by === createdByFilter;
```

And include `matchesCreatedBy` in the final `return` condition alongside the other `matches*` variables.

- [ ] **Step 5: Add created_by badge to invoice number cell**

Find `renderRow(inv)` and the `<td>` that renders `inv.invoice_number`. Update it to:

```javascript
        <td style="color:var(--gold);font-weight:600;font-size:13px">
          ${esc(inv.invoice_number)}
          <span style="font-size:10px;color:var(--text-muted);font-weight:400;margin-left:6px">${esc(inv.created_by || '')}</span>
        </td>
```

- [ ] **Step 6: Add "↓ PDF" button to each row's actions**

In `renderRow`, find the `actions` variable. For both the `isPaid` and unpaid branches, add a Download PDF button. Example for the paid branch:

```javascript
    const actions = isPaid
      ? `<button class="btn btn-ghost btn-sm" data-action="downloadPdf" data-id="${inv.id}">↓ PDF</button>
         <button class="btn btn-ghost btn-sm" data-action="resendReceipt" data-id="${inv.id}">Resend Receipt</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`
      : `<button class="btn btn-primary btn-sm" data-action="markPaid" data-id="${inv.id}">Mark Paid</button>
         <button class="btn btn-ghost btn-sm" data-action="sendAgain" data-id="${inv.id}">Resend</button>
         <button class="btn btn-ghost btn-sm" data-action="sendReminder" data-id="${inv.id}" ${hasReminder ? 'style="color:var(--text-muted)"' : ''}>Remind</button>
         <button class="btn btn-ghost btn-sm" data-action="downloadPdf" data-id="${inv.id}">↓ PDF</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`;
```

- [ ] **Step 7: Handle the downloadPdf action**

Find the table click handler that dispatches on `data-action`. Add a case for `downloadPdf`:

```javascript
        case 'downloadPdf': {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const result = await window.api.pdf.regenerate(Number(btn.dataset.id));
            await window.api.shell.openPath(result.pdfPath);
          } catch (err) {
            alert('Failed to generate PDF: ' + (err.message || err));
          } finally {
            btn.disabled = false;
            btn.textContent = '↓ PDF';
          }
          break;
        }
```

- [ ] **Step 8: Start the app and verify**

- Open Invoices screen → confirm "All Users" dropdown appears in the filter bar
- Confirm each invoice row shows the creator name in small text
- Confirm "↓ PDF" button appears on each row
- Click "↓ PDF" on any invoice → PDF should open in Finder/Preview
- Filter by "Braxton" or "Obada" → confirm it filters correctly

- [ ] **Step 9: Commit**

```bash
git add renderer/screens/invoices.js
git commit -m "feat: invoices screen — download PDF button, created_by badge, created-by filter"
```

---

## Task 10: main.js + preload.js Updates

**Files:**
- Modify: `main.js`
- Modify: `preload.js`

- [ ] **Step 1: Replace main.js entirely**

```javascript
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const db = require('./src/db');
const userConfig = require('./src/user-config');

app.setName('CFG Invoicing');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640,
    title: 'CFG Invoicing',
    icon: path.join(__dirname, 'assets', 'icon.icns'),
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  if (app.dock) {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'logo.png'));
    app.dock.setIcon(icon);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Auto-updater (checks GitHub releases on launch)
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify();
  } catch (_) {}

  // Auto-send overdue reminders 5 seconds after launch
  setTimeout(async () => {
    try {
      const settings = await db.getAllSettings();
      if (settings.overdueRemindersEnabled === 'false') return;
      const days = Number(settings.overdueReminderDays) || 7;
      const overdue = await db.getOverdueInvoices(days);
      for (const inv of overdue) {
        try {
          await sendReminderEmail({
            client: { first_name: inv.first_name, last_name: inv.last_name, email: inv.email },
            invoiceNumber: inv.invoice_number,
            invoiceDate: inv.invoice_date,
            totalAmount: inv.total_amount,
            settings
          });
          await db.markReminderSent(inv.id);
          console.log(`[reminder] Sent for invoice ${inv.invoice_number}`);
        } catch (e) {
          console.error(`[reminder] Failed for ${inv.invoice_number}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[reminder] Auto-check failed:', e.message);
    }
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// DB handlers
ipcMain.handle('db:getClients',           ()           => db.getClients());
ipcMain.handle('db:addClient',            (_, data)    => db.addClient(data));
ipcMain.handle('db:updateClient',         (_, id, data)=> db.updateClient(id, data));
ipcMain.handle('db:deleteClient',         (_, id)      => db.deleteClient(id));
ipcMain.handle('db:getInvoices',          (_, clientId)=> db.getInvoices(clientId));
ipcMain.handle('db:createInvoice',        (_, data)    => db.createInvoice(data));
ipcMain.handle('db:getAllInvoices',        ()           => db.getAllInvoices());
ipcMain.handle('db:markInvoicePaid',      (_, id)      => db.markInvoicePaid(id));
ipcMain.handle('db:deleteInvoice',        (_, id)      => db.deleteInvoice(id));
ipcMain.handle('db:getLastClientInvoice', (_, clientId)=> db.getLastClientInvoice(clientId));
ipcMain.handle('db:markReminderSent',     (_, id)      => db.markReminderSent(id));
ipcMain.handle('db:updateInvoiceNotes',   (_, id, notes)=> db.updateInvoiceNotes(id, notes));
ipcMain.handle('db:getSchemaVersion',     ()           => db.getSchemaVersion());

// Settings handlers
ipcMain.handle('settings:get',    (_, key)        => db.getSetting(key));
ipcMain.handle('settings:set',    (_, key, value) => db.setSetting(key, value));
ipcMain.handle('settings:getAll', ()              => db.getAllSettings());

// UserConfig handlers
ipcMain.handle('userConfig:isConfigured', () => userConfig.isConfigured());
ipcMain.handle('userConfig:getConfig',    () => userConfig.getConfig());
ipcMain.handle('userConfig:save',         (_, data) => userConfig.saveConfig(data));

// Dialog + shell
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('shell:openPath',     (_, p)   => shell.openPath(p));
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

const { generateInvoicePDF, generatePaidPDF, regenerateInvoicePDF } = require('./src/pdf-generator');
const { sendInvoiceEmail, sendPaidReceipt, sendReminderEmail, testConnection } = require('./src/mailer');

ipcMain.handle('pdf:generate', async (_, data) => {
  const result = await generateInvoicePDF(data);
  if (data.sendEmail) {
    await sendInvoiceEmail(result);
    await db.markInvoiceEmailed(result.invoiceId);
  }
  return { success: true, pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});

ipcMain.handle('pdf:generatePaid', async (_, data) => {
  const result = await generatePaidPDF(data);
  return { pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});

ipcMain.handle('pdf:regenerate', async (_, invoiceId) => {
  const config = userConfig.getConfig();
  if (!config) throw new Error('User not configured.');
  const result = await regenerateInvoicePDF(invoiceId, config.saveFolder);
  return { pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});

ipcMain.handle('mail:testConnection', async (_, config) => {
  await testConnection(config);
  return { success: true };
});

ipcMain.handle('mail:sendPaidReceipt', async (_, { invoiceId }) => {
  const invoice = await db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const config = userConfig.getConfig();
  if (!config) throw new Error('User not configured.');
  const settings = await db.getAllSettings();
  const { pdfPath } = await regenerateInvoicePDF(invoiceId, config.saveFolder);
  // regenerateInvoicePDF already appends -paid suffix when invoice.paid is true
  await sendPaidReceipt({
    client: { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email },
    invoiceNumber: invoice.invoice_number,
    pdfPath,
    settings
  });
});

ipcMain.handle('mail:sendReminder', async (_, { invoiceId }) => {
  const invoice = await db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const settings = await db.getAllSettings();
  await sendReminderEmail({
    client: { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email },
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    totalAmount: invoice.total_amount,
    settings
  });
  await db.markReminderSent(invoiceId);
});

ipcMain.handle('mail:sendInvoiceAgain', async (_, { invoiceId }) => {
  const invoice = await db.getInvoiceById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  const config = userConfig.getConfig();
  if (!config) throw new Error('User not configured.');
  const settings = await db.getAllSettings();
  const { pdfPath } = await regenerateInvoicePDF(invoiceId, config.saveFolder);
  await sendInvoiceEmail({
    client: { first_name: invoice.first_name, last_name: invoice.last_name, email: invoice.email, phone: invoice.phone },
    invoiceNumber: invoice.invoice_number,
    pdfPath,
    settings
  });
});
```

- [ ] **Step 2: Replace preload.js entirely**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    getClients:           ()            => ipcRenderer.invoke('db:getClients'),
    addClient:            (data)        => ipcRenderer.invoke('db:addClient', data),
    updateClient:         (id, data)    => ipcRenderer.invoke('db:updateClient', id, data),
    deleteClient:         (id)          => ipcRenderer.invoke('db:deleteClient', id),
    getInvoices:          (clientId)    => ipcRenderer.invoke('db:getInvoices', clientId),
    createInvoice:        (data)        => ipcRenderer.invoke('db:createInvoice', data),
    getAllInvoices:        ()            => ipcRenderer.invoke('db:getAllInvoices'),
    markInvoicePaid:      (id)          => ipcRenderer.invoke('db:markInvoicePaid', id),
    deleteInvoice:        (id)          => ipcRenderer.invoke('db:deleteInvoice', id),
    getLastClientInvoice: (clientId)    => ipcRenderer.invoke('db:getLastClientInvoice', clientId),
    markReminderSent:     (id)          => ipcRenderer.invoke('db:markReminderSent', id),
    updateInvoiceNotes:   (id, notes)   => ipcRenderer.invoke('db:updateInvoiceNotes', id, notes),
    getSchemaVersion:     ()            => ipcRenderer.invoke('db:getSchemaVersion'),
  },
  pdf: {
    generate:     (data)      => ipcRenderer.invoke('pdf:generate', data),
    generatePaid: (data)      => ipcRenderer.invoke('pdf:generatePaid', data),
    regenerate:   (invoiceId) => ipcRenderer.invoke('pdf:regenerate', invoiceId),
  },
  mail: {
    send:           (data, path) => ipcRenderer.invoke('mail:send', data, path),
    testConnection: (config)     => ipcRenderer.invoke('mail:testConnection', config),
    sendPaidReceipt:(data)       => ipcRenderer.invoke('mail:sendPaidReceipt', data),
    sendInvoiceAgain:(data)      => ipcRenderer.invoke('mail:sendInvoiceAgain', data),
    sendReminder:   (data)       => ipcRenderer.invoke('mail:sendReminder', data),
  },
  settings: {
    get:    (key)        => ipcRenderer.invoke('settings:get', key),
    set:    (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: ()           => ipcRenderer.invoke('settings:getAll'),
  },
  userConfig: {
    isConfigured: ()     => ipcRenderer.invoke('userConfig:isConfigured'),
    getConfig:    ()     => ipcRenderer.invoke('userConfig:getConfig'),
    save:         (data) => ipcRenderer.invoke('userConfig:save', data),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  shell: {
    openPath:     (p)   => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  }
});
```

- [ ] **Step 3: Start the app and do a full smoke test**

```bash
cd /Users/braxtonmondell/fuego-leadz && npm start
```

Run through the full flow:
1. Setup screen appears on a fresh machine (delete `~/Library/Application Support/CFG Invoicing/user-config.json` to test it)
2. After setup: clients screen loads with data from Supabase
3. Create a new invoice → verify it appears on the Invoices screen with your `created_by` tag
4. Click "↓ PDF" → PDF opens
5. Settings screen shows User Settings card at top

- [ ] **Step 4: Run tests**

```bash
npx jest --no-coverage
```

Expected: PASS — 13 tests (user-config: 6, invoice-number: 7).

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat: add userConfig IPC, pdf:regenerate IPC, electron-updater, async db throughout"
```

---

## Task 11: scripts/migrate-to-supabase.js

**Files:**
- Create: `scripts/migrate-to-supabase.js`

This script is run **once** on Braxton's machine before distributing the new app. It reads the existing local SQLite database and pushes all data to Supabase.

- [ ] **Step 1: Create scripts/ directory and the migration script**

```bash
mkdir -p /Users/braxtonmondell/fuego-leadz/scripts
```

Create `scripts/migrate-to-supabase.js`:

```javascript
#!/usr/bin/env node
// One-time migration: local SQLite → Supabase
// Run from project root: node scripts/migrate-to-supabase.js

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../src/supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const dbPath = path.join(
  os.homedir(), 'Library', 'Application Support', 'CFG Invoicing', 'fuego-leadz.db'
);

const SKIP_SETTINGS = new Set(['smtpUser', 'smtpPass', 'saveFolder']);

async function migrate() {
  console.log('Reading SQLite from:', dbPath);
  const sqlite = new Database(dbPath, { readonly: true });

  // 1. Clients
  const clients = sqlite.prepare('SELECT * FROM clients').all();
  console.log(`\nMigrating ${clients.length} clients...`);
  for (const c of clients) {
    const { error } = await supabase.from('clients').upsert({
      id: c.id, first_name: c.first_name, last_name: c.last_name,
      email: c.email, phone: c.phone, created_at: c.created_at
    }, { onConflict: 'id' });
    if (error) console.error(`  Client ${c.id} (${c.last_name}):`, error.message);
    else process.stdout.write('.');
  }

  // 2. Invoices
  const invoices = sqlite.prepare('SELECT * FROM invoices').all();
  console.log(`\nMigrating ${invoices.length} invoices...`);
  for (const inv of invoices) {
    const { error } = await supabase.from('invoices').upsert({
      id: inv.id, client_id: inv.client_id,
      invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
      total_amount: inv.total_amount, pdf_path: inv.pdf_path || null,
      emailed: !!inv.emailed, paid: !!inv.paid, paid_at: inv.paid_at || null,
      payment_method: inv.payment_method || null,
      reminder_sent_at: inv.reminder_sent_at || null,
      notes: inv.notes || null,
      invoice_type: inv.invoice_type || 'lead',
      created_by: 'braxton',
      created_at: inv.created_at
    }, { onConflict: 'id' });
    if (error) console.error(`  Invoice ${inv.id} (${inv.invoice_number}):`, error.message);
    else process.stdout.write('.');
  }

  // 3. Line items
  const items = sqlite.prepare('SELECT * FROM invoice_line_items').all();
  console.log(`\nMigrating ${items.length} line items...`);
  for (const li of items) {
    const { error } = await supabase.from('invoice_line_items').upsert({
      id: li.id, invoice_id: li.invoice_id,
      lead_type: li.lead_type, quantity: li.quantity,
      unit_price: li.unit_price, guaranteed_minimum: li.guaranteed_minimum || null
    }, { onConflict: 'id' });
    if (error) console.error(`  Line item ${li.id}:`, error.message);
    else process.stdout.write('.');
  }

  // 4. Global settings only
  const settings = sqlite.prepare('SELECT * FROM settings').all()
    .filter(r => !SKIP_SETTINGS.has(r.key));
  console.log(`\nMigrating ${settings.length} global settings...`);
  for (const s of settings) {
    const { error } = await supabase.from('settings')
      .upsert({ key: s.key, value: s.value }, { onConflict: 'key' });
    if (error) console.error(`  Setting ${s.key}:`, error.message);
  }

  // Ensure schemaVersion is set
  await supabase.from('settings')
    .upsert({ key: 'schemaVersion', value: '1' }, { onConflict: 'key' });

  sqlite.close();
  console.log('\n\nMigration complete!');
  console.log('Your local SQLite file is preserved at:', dbPath);
  console.log('The app will now use Supabase for all data.');
}

migrate().catch(e => { console.error('\nMigration failed:', e.message); process.exit(1); });
```

- [ ] **Step 2: Run the migration**

```bash
node scripts/migrate-to-supabase.js
```

Expected output:
```
Reading SQLite from: /Users/braxton/Library/Application Support/CFG Invoicing/fuego-leadz.db

Migrating N clients...
...(dots)

Migrating N invoices...
...(dots)

Migrating N line items...
...(dots)

Migrating N global settings...

Migration complete!
Your local SQLite file is preserved at: ...
```

If you see any error lines, check the Supabase table structure matches the SQL from Task 1.

- [ ] **Step 3: Verify in Supabase dashboard**

Open Supabase → Table Editor → `clients`. Confirm your clients appear. Check `invoices`. Confirm all historical invoices have `created_by = 'braxton'`.

- [ ] **Step 4: Start the app and verify data shows up**

```bash
npm start
```

The clients screen should show all existing clients. The invoices screen should show all historical invoices. All data is now live from Supabase.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-to-supabase.js
git commit -m "feat: one-time SQLite to Supabase migration script"
```

---

## Task 12: Cleanup — Remove better-sqlite3

**Files:**
- Modify: `package.json`
- Modify: `package.json` (postinstall script)

**Do this task only after the migration has been run successfully and the app is confirmed working with Supabase.**

- [ ] **Step 1: Remove better-sqlite3 from dependencies**

```bash
npm uninstall better-sqlite3
```

- [ ] **Step 2: Remove the electron-rebuild postinstall script**

In `package.json`, find the `"scripts"` section. Remove or update the `"postinstall"` line that runs `electron-rebuild -f -w better-sqlite3` — it's no longer needed.

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: PASS — 13 tests (user-config: 6, invoice-number: 7).

- [ ] **Step 4: Start the app one more time to confirm**

```bash
npm start
```

Expected: app launches, shows clients from Supabase, no errors in terminal.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove better-sqlite3 now that Supabase migration is complete"
```
