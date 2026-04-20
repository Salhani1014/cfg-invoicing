const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { generateInvoiceNumber } = require('./invoice-number');

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
    paymentMethod: data.paymentMethod || 'paymentZelle',
    invoiceType: data.invoiceType || 'lead'
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
    const payload = JSON.stringify({ client, date, lineItems, totalAmount, invoiceNumber, settings, logoBase64, paymentMethod: data.paymentMethod || 'paymentZelle', invoiceType: data.invoiceType || 'lead', paid: false });
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
      invoiceType: invoice.invoice_type || 'lead',
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
