const nodemailer = require('nodemailer');
const fs = require('fs');
const db = require('./db');

function makeTransport(smtpUser, smtpPass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

async function sendInvoiceEmail({ client, invoiceNumber, pdfPath, settings }) {
  if (!settings.smtpUser || !settings.smtpPass) {
    throw new Error('Email not configured. Please set up SMTP in Settings.');
  }
  const transport = makeTransport(settings.smtpUser, settings.smtpPass);
  const fromEmail = settings.smtpUser;

  await transport.sendMail({
    from: `"Fuego Leadz LLC" <${fromEmail}>`,
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
      content: await fs.promises.readFile(pdfPath)
    }]
  });
}

async function testConnection(config) {
  const transport = makeTransport(config.smtpUser, config.smtpPass);
  await transport.verify();
}

module.exports = { sendInvoiceEmail, testConnection };
