const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { generateInvoiceNumber } = require('./invoice-number');

async function generateInvoicePDF(data) {
  const { client, date, lineItems, totalAmount, saveFolder, sendEmail } = data;

  const settings = db.getAllSettings();
  const seq = db.getNextInvoiceSeq(client.id);
  const invoiceNumber = generateInvoiceNumber(client.last_name, client.first_name, date, seq);

  const invoiceId = db.createInvoice({
    clientId: client.id,
    invoiceNumber,
    invoiceDate: date,
    totalAmount,
    lineItems
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
  await win.loadFile(templatePath);

  await win.webContents.executeJavaScript(`
    renderInvoice(${JSON.stringify({
      client, date, lineItems, totalAmount, invoiceNumber, settings
    })});
  `);

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
