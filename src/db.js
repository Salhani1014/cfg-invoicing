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
