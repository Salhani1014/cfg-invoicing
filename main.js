const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./src/db');
const userConfig = require('./src/user-config');
const dbContractors = require('./src/db-contractors');
const tt = require('./src/db-time-tracking');
const auth = require('./src/auth');

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

app.whenReady().then(async () => {
  if (app.dock) {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'logo.png'));
    app.dock.setIcon(icon);
  }

  // Restore Supabase session before the renderer queries auth status.
  try { await auth.restoreSession(); } catch (e) { console.error('[auth] restore failed:', e.message); }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Mandatory updates with bulletproof detection. Two layers:
  //   1. Custom GitHub-API check (always works — no signing / quarantine
  //      requirements). Fires the modal even when electron-updater would
  //      silently fail.
  //   2. electron-updater (handles seamless download+install when it can).
  //      If it errors, the modal falls back to opening the GitHub release
  //      page in the browser so the user can download manually.
  //
  // Both run on launch + every 5 min + on every window focus.

  function semverGreater(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return true;
      if ((pa[i] || 0) < (pb[i] || 0)) return false;
    }
    return false;
  }

  let lastNotifiedVersion = null;

  async function customGithubCheck(label) {
    try {
      const res = await fetch(
        'https://api.github.com/repos/Salhani1014/cfg-invoicing/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } }
      );
      if (!res.ok) {
        console.error(`[updater] github ${label} check failed: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const tag = (data.tag_name || '').replace(/^v/, '');
      const current = app.getVersion();
      console.log(`[updater] github ${label} check: current=${current} latest=${tag}`);
      if (semverGreater(tag, current) && tag !== lastNotifiedVersion) {
        lastNotifiedVersion = tag;
        console.log('[updater] UPDATE AVAILABLE (via github check):', tag);
        mainWindow?.webContents.send('update-available', {
          version: tag,
          releaseNotes: data.body || '',
          htmlUrl: data.html_url || '',
        });
      }
    } catch (e) {
      console.error(`[updater] github ${label} check error:`, e?.message || e);
    }
  }

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => console.log('[updater] eu checking…'));
    autoUpdater.on('update-not-available', info => console.log('[updater] eu: no update'));
    autoUpdater.on('update-available', info => {
      console.log('[updater] eu UPDATE AVAILABLE:', info?.version);
      // Don't re-fire the modal if github check already did
      if (info?.version && info.version !== lastNotifiedVersion) {
        lastNotifiedVersion = info.version;
        mainWindow?.webContents.send('update-available', {
          version: info.version,
          releaseNotes: info.releaseNotes || '',
        });
      }
    });
    autoUpdater.on('download-progress', p => {
      mainWindow?.webContents.send('update-download-progress', {
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      });
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', err => {
      console.error('[updater] eu error:', err.message);
      // Send the error to the renderer so the modal can switch to the
      // "open GitHub release in browser" fallback path. The modal is
      // already mandatory; the user still HAS to update, just maybe via
      // manual download.
      mainWindow?.webContents.send('update-error', err.message);
    });

    const euCheck = (label) => {
      Promise.resolve(autoUpdater.checkForUpdates()).catch(e =>
        console.error(`[updater] eu ${label} check failed:`, e?.message || e)
      );
    };

    // Run BOTH checks on launch + every 5 min + on every window focus.
    customGithubCheck('launch');
    euCheck('launch');

    setInterval(() => {
      customGithubCheck('periodic');
      euCheck('periodic');
    }, 5 * 60 * 1000);

    mainWindow?.on('focus', () => {
      customGithubCheck('focus');
      euCheck('focus');
    });
  } catch (e) {
    // electron-updater might not load (dev mode) — github check still runs
    console.error('[updater] electron-updater unavailable, github check only:', e?.message);
    customGithubCheck('launch');
    setInterval(() => customGithubCheck('periodic'), 5 * 60 * 1000);
    mainWindow?.on('focus', () => customGithubCheck('focus'));
  }

  // Auto-send overdue reminders 5 seconds after launch
  setTimeout(async () => {
    try {
      const settings = await db.getAllSettings();
      if (settings.overdueRemindersEnabled === 'false') return;
      const parsedDays = Number(settings.overdueReminderDays);
      const days = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
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

// Auth handlers
ipcMain.handle('auth:status',             ()                  => auth.getStatus());
ipcMain.handle('auth:signIn',             (_e, email, pass)   => auth.signInWithPassword(email, pass));
ipcMain.handle('auth:sendOtp',            (_e, email)         => auth.signInWithOtp(email));
ipcMain.handle('auth:verifyOtp',          (_e, email, token)  => auth.verifyOtp(email, token));
ipcMain.handle('auth:signOut',            async ()            => {
  await auth.signOut();
  // Reload the renderer so it lands back on the login screen.
  try { mainWindow?.reload(); } catch (_) {}
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

// ─── Time Tracking IPC ─────────────────────────────────────────
ipcMain.handle('tt:listEmployees',          ()                       => tt.listEmployees());
ipcMain.handle('tt:createEmployee',         (_e, data)               => tt.createEmployee(data));
ipcMain.handle('tt:updateEmployee',         (_e, id, patch)          => tt.updateEmployee(id, patch));
ipcMain.handle('tt:unbindDevice',           (_e, employeeId)         => tt.unbindDevice(employeeId));
ipcMain.handle('tt:listShifts',             (_e, employeeId, week)   => tt.listShifts(employeeId, week));
ipcMain.handle('tt:listWifiEventsForShift', (_e, shiftId)            => tt.listWifiEventsForShift(shiftId));
ipcMain.handle('tt:editShift',              (_e, id, patch, admin)   => tt.editShift(id, patch, admin));
ipcMain.handle('tt:closeShiftViaAudit',     (_e, shiftId, admin)     => tt.closeShiftViaAudit(shiftId, admin));
ipcMain.handle('tt:listOpenMismatches',     ()                       => tt.listOpenMismatches());
ipcMain.handle('tt:liveStatus',             ()                       => tt.liveStatus());

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
ipcMain.handle('autoUpdater:install', () => {
  try { require('electron-updater').autoUpdater.quitAndInstall(); } catch (e) { console.error('[updater] Install failed:', e.message); }
});
ipcMain.handle('autoUpdater:download', async () => {
  try {
    await require('electron-updater').autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    console.error('[updater] download failed:', e.message);
    return { ok: false, error: e.message };
  }
});

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
  const maskTaxId = id => {
    if (!id) return '';
    const d = id.indexOf('-');
    if (d === 2) return '**-***' + id.slice(-4);
    if (d === 3) return '***-**-' + id.slice(-4);
    return '***-**-' + id.slice(-4);
  };
  const header = 'Pay Date,Contractor,Tax ID,Classification,Description,Hours,Rate,Total,Payment Method,Period Total,1099 Required\n';
  const rows = payments.map(p => {
    const total = ytdByContractor[p.contractor_id] || 0;
    return [
      p.pay_date,
      `"${p.legal_name}"`,
      maskTaxId(p.tax_id),
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
