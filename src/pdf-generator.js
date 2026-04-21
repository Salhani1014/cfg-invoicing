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
