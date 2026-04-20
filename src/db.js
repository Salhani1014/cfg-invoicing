const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDb() {
  if (db) return db;
  let userDataPath;
  try {
    const { app } = require('electron');
    userDataPath = app ? app.getPath('userData') : null;
  } catch (_) {
    userDataPath = null;
  }
  userDataPath = userDataPath || path.join(__dirname, '..', 'test-data');
  db = new Database(path.join(userDataPath, 'fuego-leadz.db'));
  db.pragma('foreign_keys = ON');
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

    CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
  `);

  // Safe column additions — no-op if already present
  const cols = db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name);
  if (!cols.includes('paid'))              db.exec('ALTER TABLE invoices ADD COLUMN paid INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('paid_at'))           db.exec('ALTER TABLE invoices ADD COLUMN paid_at TEXT');
  if (!cols.includes('payment_method'))    db.exec('ALTER TABLE invoices ADD COLUMN payment_method TEXT');
  if (!cols.includes('reminder_sent_at'))  db.exec('ALTER TABLE invoices ADD COLUMN reminder_sent_at TEXT');
  if (!cols.includes('notes'))             db.exec('ALTER TABLE invoices ADD COLUMN notes TEXT');
  if (!cols.includes('invoice_type'))      db.exec("ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'lead'");
}

// Clients
function getClients() {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT invoice_date FROM invoices WHERE client_id = c.id ORDER BY invoice_date DESC LIMIT 1) as last_invoice_date,
      (SELECT total_amount FROM invoices WHERE client_id = c.id ORDER BY invoice_date DESC LIMIT 1) as last_invoice_amount,
      (SELECT COUNT(*) FROM invoices WHERE client_id = c.id AND paid=0 AND julianday('now') - julianday(invoice_date) >= 7) as overdue_count,
      COALESCE((SELECT SUM(total_amount) FROM invoices WHERE client_id = c.id AND paid=0), 0) as total_unpaid
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
  const db = getDb();
  db.transaction(() => {
    const invoiceIds = db.prepare('SELECT id FROM invoices WHERE client_id=?').all(id).map(r => r.id);
    for (const invoiceId of invoiceIds) {
      db.prepare('DELETE FROM invoice_line_items WHERE invoice_id=?').run(invoiceId);
    }
    db.prepare('DELETE FROM invoices WHERE client_id=?').run(id);
    db.prepare('DELETE FROM clients WHERE id=?').run(id);
  })();
}

// Invoices
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

function getLastClientInvoice(clientId) {
  const invoice = getDb().prepare(
    'SELECT * FROM invoices WHERE client_id=? ORDER BY invoice_date DESC LIMIT 1'
  ).get(clientId);
  if (!invoice) return null;
  const lineItems = getDb().prepare(
    'SELECT lead_type, quantity, unit_price, guaranteed_minimum FROM invoice_line_items WHERE invoice_id=?'
  ).all(invoice.id);
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

function markReminderSent(id) {
  getDb().prepare("UPDATE invoices SET reminder_sent_at=datetime('now') WHERE id=?").run(id);
}

function updateInvoiceNotes(id, notes) {
  getDb().prepare('UPDATE invoices SET notes=? WHERE id=?').run(notes || null, id);
}

function getOverdueInvoices(days = 7) {
  return getDb().prepare(`
    SELECT i.*, c.first_name, c.last_name, c.email, c.phone
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    WHERE i.paid = 0
      AND i.reminder_sent_at IS NULL
      AND julianday('now') - julianday(i.invoice_date) >= ?
  `).all(days);
}

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
    .reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getClients, addClient, updateClient, deleteClient,
  createInvoice, updateInvoicePdfPath, markInvoiceEmailed,
  markInvoicePaid, deleteInvoice, getInvoiceById,
  getLastClientInvoice, markReminderSent, updateInvoiceNotes, getOverdueInvoices,
  getInvoices, getAllInvoices, getNextInvoiceSeq,
  getSetting, setSetting, getAllSettings,
  closeDb,
  _getDb: getDb
};
