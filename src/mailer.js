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
