process.env.NODE_ENV = 'test';
const path = require('path');
const fs = require('fs');

jest.mock('electron', () => ({ app: null }), { virtual: true });

const testDataDir = path.join(__dirname, '..', 'test-data');
beforeAll(() => fs.mkdirSync(testDataDir, { recursive: true }));
afterAll(() => fs.rmSync(testDataDir, { recursive: true, force: true }));

beforeEach(() => {
  try { require('../src/db').closeDb(); } catch (_) {}
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
