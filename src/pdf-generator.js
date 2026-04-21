const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { generateInvoiceNumber, generatePayStubNumber } = require('./invoice-number');
const userConfig = require('./user-config');
const dbContractors = require('./db-contractors');
const os = require('os');

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

async function renderPayStubToPDF(data) {
  const win = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { contextIsolation: true }
  });
  const templatePath = path.join(__dirname, '..', 'renderer', 'pay-stub-template', 'template.html');
  try {
    await win.loadFile(templatePath);
    const payload = JSON.stringify(data);
    await win.webContents.executeJavaScript(
      `window.__stub = JSON.parse(${JSON.stringify(payload)}); renderPayStub(window.__stub);`
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

async function generatePayStub(data) {
  const { contractor, payment, saveFolder, sendEmail } = data;
  const config = userConfig.getConfig();
  const settings = await db.getAllSettings();
  const year = payment.payDate.slice(0, 4);

  // Insert payment record first (pdf_path filled in after generation)
  const paymentId = await dbContractors.addContractorPayment({
    contractorId: contractor.id,
    payDate: payment.payDate,
    payPeriodStart: payment.payPeriodStart || null,
    payPeriodEnd: payment.payPeriodEnd || null,
    hours: payment.hours,
    hourlyRate: payment.hourlyRate,
    totalAmount: payment.totalAmount,
    description: payment.description,
    paymentMethod: payment.paymentMethod || 'paymentZelle',
    recurring: payment.recurring || false,
    createdBy: config?.user || null
  });

  // YTD includes the just-inserted payment
  const ytdTotal = await dbContractors.getContractorYtd(contractor.id, year);

  const stubNumber = generatePayStubNumber(contractor.legal_name, payment.payDate);
  const folderName = contractor.legal_name.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40);
  const contractorFolder = path.join(saveFolder, folderName);
  fs.mkdirSync(contractorFolder, { recursive: true });
  const pdfPath = path.join(contractorFolder, `${stubNumber}.pdf`);

  const payRecord = {
    pay_date: payment.payDate,
    pay_period_start: payment.payPeriodStart || null,
    pay_period_end: payment.payPeriodEnd || null,
    hours: payment.hours,
    hourly_rate: payment.hourlyRate,
    total_amount: payment.totalAmount,
    description: payment.description,
    payment_method: payment.paymentMethod || 'paymentZelle'
  };

  const pdfBuffer = await renderPayStubToPDF({ contractor, payment: payRecord, ytdTotal, stubNumber, settings });
  fs.writeFileSync(pdfPath, pdfBuffer);
  await dbContractors.updateContractorPaymentPdfPath(paymentId, pdfPath);

  return { paymentId, stubNumber, pdfPath, contractor, sendEmail, settings };
}

async function generateYearEndSummaryPDF({ year, contractors, grandTotal, saveFolder }) {
  const fmtCurrency = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const maskTaxId = id => {
    if (!id) return '';
    const firstDash = id.indexOf('-');
    if (firstDash === 2) return '**-***' + id.slice(-4);
    if (firstDash === 3) return '***-**-' + id.slice(-4);
    return '***-**-' + id.slice(-4);
  };
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const rows = contractors.map(c => `
    <tr>
      <td>${escHtml(c.legal_name)}</td>
      <td>${maskTaxId(c.tax_id)}</td>
      <td>${escHtml(c.tax_classification)}</td>
      <td style="text-align:right;font-weight:600">${fmtCurrency(c.total)}</td>
      <td style="text-align:center">${c.total >= 600 ? 'Yes' : 'No'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 12px; padding: 40px; }
h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.meta { font-size: 11px; margin-bottom: 4px; }
.disclaimer { font-size: 10px; font-style: italic; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
thead tr { border-bottom: 2px solid #000; }
thead th { padding: 7px 8px; text-align: left; font-weight: 700; }
thead th:nth-child(4) { text-align: right; }
thead th:nth-child(5) { text-align: center; }
tbody tr { border-bottom: 1px solid #000; }
tbody td { padding: 7px 8px; }
.grand-row td { font-weight: 700; padding: 8px; border-top: 2px solid #000; }
.grand-row td:first-child { text-align: right; padding-right: 8px; }
.grand-row td.amount { text-align: right; font-weight: 700; }
.footer { margin-top: 20px; font-size: 10px; color: #000; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<h1>Contractor Payment Summary \u2014 ${year}</h1>
<div class="meta">Checkmate Financial Group LLC &middot; Generated ${today}</div>
<div class="disclaimer">This is an internal record-keeping document, not an official tax form.</div>
<table>
  <thead>
    <tr>
      <th>Contractor</th>
      <th>Tax ID</th>
      <th>Classification</th>
      <th style="text-align:right">Total Paid</th>
      <th style="text-align:center">&ge;$600?</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="grand-row">
      <td colspan="3" style="text-align:right">Grand Total</td>
      <td class="amount">${fmtCurrency(grandTotal)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
<div class="footer">Consult your accountant for 1099-NEC filing requirements. Florida has no state income tax.</div>
</body></html>`;

  const tmpPath = path.join(os.tmpdir(), `cfg-year-end-${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  const win = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { contextIsolation: true }
  });
  try {
    await win.loadFile(tmpPath);
    await new Promise(r => setTimeout(r, 300));
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true, pageSize: 'Letter',
      margins: { top: 40, bottom: 40, left: 40, right: 40 }
    });
    const pdfPath = path.join(saveFolder, `contractor-summary-${year}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    return pdfPath;
  } finally {
    if (!win.isDestroyed()) win.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

module.exports = { generateInvoicePDF, generatePaidPDF, regenerateInvoicePDF, generatePayStub, generateYearEndSummaryPDF };
