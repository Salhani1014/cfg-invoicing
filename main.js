const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./src/db');
const userConfig = require('./src/user-config');
const dbContractors = require('./src/db-contractors');

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

const { generateInvoicePDF, generatePaidPDF, regenerateInvoicePDF, generatePayStub, generateYearEndSummaryPDF } = require('./src/pdf-generator');
const { sendInvoiceEmail, sendPaidReceipt, sendReminderEmail, testConnection, sendPayStub } = require('./src/mailer');

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

// Contractor DB handlers
ipcMain.handle('db:getContractors',          ()            => dbContractors.getContractors());
ipcMain.handle('db:addContractor',           (_, data)     => dbContractors.addContractor(data));
ipcMain.handle('db:updateContractor',        (_, id, data) => dbContractors.updateContractor(id, data));
ipcMain.handle('db:deleteContractor',        (_, id)       => dbContractors.deleteContractor(id));
ipcMain.handle('db:getContractorPayments',   (_, id)       => dbContractors.getContractorPayments(id));
ipcMain.handle('db:updateContractorPayment', (_, id, data) => dbContractors.updateContractorPayment(id, data));
ipcMain.handle('db:deleteContractorPayment', (_, id)       => dbContractors.deleteContractorPayment(id));

// Pay stub PDF
ipcMain.handle('pdf:generatePayStub', async (_, data) => {
  const result = await generatePayStub(data);
  if (data.sendEmail) {
    await sendPayStub({ contractor: result.contractor, stubNumber: result.stubNumber, pdfPath: result.pdfPath, settings: result.settings });
    await dbContractors.markContractorPaymentEmailed(result.paymentId);
  }
  return { success: true, pdfPath: result.pdfPath, stubNumber: result.stubNumber };
});

// Export handlers
ipcMain.handle('contractors:exportCsv', async (_, params) => {
  const config = userConfig.getConfig();
  if (!config?.saveFolder) throw new Error('Save folder not configured. Go to Settings to set it up.');

  const payments = await dbContractors.getContractorPaymentsFiltered(params);

  const ytdByContractor = {};
  for (const p of payments) {
    ytdByContractor[p.contractor_id] = (ytdByContractor[p.contractor_id] || 0) + Number(p.total_amount);
  }

  const pmLabel = { paymentZelle: 'Zelle', paymentBank: 'Bank Transfer', paymentOther: 'Other' };
  const header = 'Pay Date,Contractor,Tax ID,Classification,Description,Hours,Rate,Total,Payment Method,Period Total,1099 Required\n';
  const rows = payments.map(p => {
    const total = ytdByContractor[p.contractor_id] || 0;
    return [
      p.pay_date,
      `"${p.legal_name}"`,
      p.tax_id,
      `"${p.tax_classification}"`,
      `"${(p.description || '').replace(/"/g, '""')}"`,
      p.hours,
      p.hourly_rate,
      p.total_amount,
      pmLabel[p.payment_method] || p.payment_method || 'Zelle',
      total.toFixed(2),
      total >= 600 ? 'Yes' : 'No'
    ].join(',');
  }).join('\n');

  const year = params.year || new Date().getFullYear().toString();
  const csvPath = path.join(config.saveFolder, `contractor-payments-${year}.csv`);
  fs.writeFileSync(csvPath, header + rows, 'utf8');
  await shell.openPath(csvPath);
  return { csvPath };
});

ipcMain.handle('contractors:exportSummaryPdf', async (_, params) => {
  const config = userConfig.getConfig();
  if (!config?.saveFolder) throw new Error('Save folder not configured. Go to Settings to set it up.');

  const contractors = await dbContractors.getContractorsForExport(params);
  const grandTotal = contractors.reduce((s, c) => s + Number(c.total), 0);
  const year = params.year || new Date().getFullYear().toString();

  const pdfPath = await generateYearEndSummaryPDF({
    year, contractors, grandTotal, saveFolder: config.saveFolder
  });
  await shell.openPath(pdfPath);
  return { pdfPath };
});
