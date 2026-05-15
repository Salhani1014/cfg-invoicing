const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./src/db');
const userConfig = require('./src/user-config');
const dbContractors = require('./src/db-contractors');
const tt = require('./src/db-time-tracking');
const auth = require('./src/auth');

// Bundle the read-only GitHub PAT (private-repo auto-update). The token file
// is gitignored and bundled into the asar at build time. If absent, the
// update checks fall back to anonymous (which always 404s on private repos).
// electron-updater reads GH_TOKEN automatically when set on process.env.
try {
  const ghToken = require('./src/github-token').GITHUB_TOKEN;
  if (ghToken && typeof ghToken === 'string' && ghToken.length > 10) {
    process.env.GH_TOKEN = ghToken;
  }
} catch (_) { /* no token bundled — fall back to anonymous */ }

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

  // Re-emit any buffered update-info once the renderer has fully loaded —
  // closes the launch-time race where update checks fired before the
  // renderer's IPC listeners were registered.
  mainWindow.webContents.on('did-finish-load', () => {
    if (global.__bufferedUpdateInfo) {
      console.log('[updater] renderer ready — re-emitting buffered update-available');
      try {
        mainWindow.webContents.send('update-available', global.__bufferedUpdateInfo);
      } catch (e) {
        console.error('[updater] re-emit failed:', e?.message || e);
      }
    }
  });
}

// Custom app menu with a manual "Check for Updates…" item. The function
// itself is wired below — once defined we install the menu.
function buildAppMenu(triggerCheck) {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          accelerator: 'CmdOrCtrl+U',
          click: () => triggerCheck && triggerCheck('manual'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      role: 'viewMenu',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
  // Buffer the most recent update-available payload so we can re-emit it
  // when the renderer finishes loading. The launch-time check often fires
  // BEFORE renderer/updater.js has registered its IPC listener — that race
  // is the most likely reason the modal never popped.
  let bufferedUpdateInfo = null;

  function emitUpdateAvailable(info) {
    bufferedUpdateInfo = info;
    // Stash on global so did-finish-load (defined inside createWindow) can
    // pick it up — they share the same module scope but the createWindow
    // closure was created before this function existed during refactor.
    global.__bufferedUpdateInfo = info;
    try {
      if (mainWindow?.webContents && !mainWindow.webContents.isLoading()) {
        mainWindow.webContents.send('update-available', info);
        console.log('[updater] → emitted update-available to renderer');
      } else {
        console.log('[updater] renderer not ready; buffering update-available for did-finish-load');
      }
    } catch (e) {
      console.error('[updater] emit failed:', e?.message || e);
    }
  }

  async function customGithubCheck(label) {
    const isManual = label === 'manual' || label === 'manual-ipc' || label === 'manual-settings';
    // Manual checks always re-trigger UI feedback, even if we already
    // notified about this version on launch.
    if (isManual) lastNotifiedVersion = null;

    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
      const res = await fetch(
        'https://api.github.com/repos/Salhani1014/cfg-invoicing/releases/latest',
        { headers }
      );
      if (!res.ok) {
        const msg = `GitHub returned HTTP ${res.status}` +
          (res.status === 404 && !process.env.GH_TOKEN ? ' (private repo — token missing)' : '');
        console.error(`[updater] github ${label} check failed: ${msg}`);
        if (isManual) {
          await dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Update Check Failed',
            message: 'Could not reach update server',
            detail: msg + '\n\nCheck your internet connection and try again.',
            buttons: ['OK'],
          });
        }
        return;
      }
      const data = await res.json();
      const tag = (data.tag_name || '').replace(/^v/, '');
      const current = app.getVersion();
      console.log(`[updater] github ${label} check: current=${current} latest=${tag}`);

      if (semverGreater(tag, current)) {
        lastNotifiedVersion = tag;
        console.log('[updater] UPDATE AVAILABLE (via github check):', tag);

        // Still emit the IPC event so the polished in-app modal can fire if
        // the renderer is ready. But ALSO show a native dialog for manual
        // checks — this is the bulletproof path that works no matter what.
        emitUpdateAvailable({
          version: tag,
          releaseNotes: data.body || '',
          htmlUrl: data.html_url || '',
        });

        if (isManual) {
          const dmgAsset = (data.assets || []).find(a => a.name?.endsWith('.dmg'));
          const choice = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `Version ${tag} is available`,
            detail: `You're currently on v${current}.\n\nClick "Download" to grab the installer. After it downloads, drag CFG Invoicing into Applications (replace the old one), then quit and reopen the app.`,
            buttons: ['Download', 'Later'],
            defaultId: 0,
            cancelId: 1,
          });
          if (choice.response === 0) {
            const url = dmgAsset?.browser_download_url
              || data.html_url
              || `https://github.com/Salhani1014/cfg-invoicing/releases/tag/v${tag}`;
            shell.openExternal(url);
          }
        }
        return;
      }

      // No update available
      if (isManual) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'No Updates Available',
          message: "You're up to date",
          detail: `Running the latest version (v${current}).`,
          buttons: ['OK'],
        });
      }
    } catch (e) {
      const msg = e?.message || String(e);
      console.error(`[updater] github ${label} check error:`, msg);
      if (isManual) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Update Check Failed',
          message: 'Could not check for updates',
          detail: msg + '\n\nTry again in a moment, or download the latest version directly from GitHub.',
          buttons: ['Open GitHub', 'OK'],
          defaultId: 1,
          cancelId: 1,
        }).then(r => {
          if (r.response === 0) {
            shell.openExternal('https://github.com/Salhani1014/cfg-invoicing/releases/latest');
          }
        });
      }
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
      if (info?.version && info.version !== lastNotifiedVersion) {
        lastNotifiedVersion = info.version;
        emitUpdateAvailable({
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

  // Install the app menu with the manual "Check for Updates…" item now
  // that customGithubCheck is in scope. CmdOrCtrl+U triggers it from
  // anywhere in the app.
  buildAppMenu(customGithubCheck);

  // IPC handler so the renderer can also trigger a manual check (e.g. from
  // a Settings button).
  ipcMain.handle('updater:checkNow', async () => {
    await customGithubCheck('manual-settings');
    return { ok: true };
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

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
// ─── Custom auto-update (bypasses Squirrel.Mac) ──────────────────────
// We're ad-hoc signing (no Apple Developer ID), so Squirrel.Mac rejects
// the new app at code-signature validation. Instead, we download the
// ZIP from GitHub ourselves, extract with `ditto`, and use a detached
// shell script to swap /Applications/CFG\ Invoicing.app and relaunch
// AFTER we quit. No signing required.
const os = require('os');
const { spawn } = require('child_process');

let stagedAppPath = null; // path to the extracted .app, set after download

ipcMain.handle('autoUpdater:download', async () => {
  try {
    await customDownloadAndStage();
    return { ok: true };
  } catch (e) {
    console.error('[updater] custom download failed:', e?.message || e);
    mainWindow?.webContents.send('update-error', e?.message || String(e));
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('autoUpdater:install', async () => {
  try {
    await customInstallAndQuit();
  } catch (e) {
    console.error('[updater] custom install failed:', e?.message || e);
    mainWindow?.webContents.send('update-error', e?.message || String(e));
  }
});

async function customDownloadAndStage() {
  // Fetch latest release manifest from GitHub
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const relRes = await fetch(
    'https://api.github.com/repos/Salhani1014/cfg-invoicing/releases/latest',
    { headers }
  );
  if (!relRes.ok) throw new Error(`GitHub release lookup failed: HTTP ${relRes.status}`);
  const release = await relRes.json();
  const zipAsset = (release.assets || []).find(
    a => a.name.endsWith('-mac.zip') || (a.name.endsWith('.zip') && !a.name.endsWith('.blockmap'))
  );
  if (!zipAsset) throw new Error('No .zip asset in latest release.');

  const tmpDir = path.join(os.tmpdir(), `cfg-update-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, 'update.zip');

  // Download the ZIP with progress reporting
  console.log(`[updater] downloading ${zipAsset.browser_download_url}`);
  const dlRes = await fetch(zipAsset.browser_download_url);
  if (!dlRes.ok || !dlRes.body) throw new Error(`Download failed: HTTP ${dlRes.status}`);
  const total = Number(dlRes.headers.get('content-length') || zipAsset.size || 0);
  const startedAt = Date.now();
  let downloaded = 0;

  const writer = fs.createWriteStream(zipPath);
  const reader = dlRes.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    writer.write(value);
    downloaded += value.length;
    const elapsed = (Date.now() - startedAt) / 1000;
    mainWindow?.webContents.send('update-download-progress', {
      percent: total ? (downloaded / total) * 100 : 0,
      bytesPerSecond: elapsed > 0 ? downloaded / elapsed : 0,
      transferred: downloaded,
      total,
    });
  }
  await new Promise((resolve, reject) => {
    writer.end(err => err ? reject(err) : resolve());
  });

  // Extract with `ditto` — preserves macOS metadata, code signature, etc.
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir);
  console.log(`[updater] extracting to ${extractDir}`);
  await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
    let stderr = '';
    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`ditto exit ${code}: ${stderr.trim()}`));
    });
  });

  const apps = fs.readdirSync(extractDir).filter(f => f.endsWith('.app'));
  if (apps.length === 0) throw new Error('No .app bundle found in extracted ZIP.');
  stagedAppPath = path.join(extractDir, apps[0]);
  console.log(`[updater] staged at ${stagedAppPath}`);

  // Signal renderer that download phase is complete
  mainWindow?.webContents.send('update-downloaded');
}

async function customInstallAndQuit() {
  if (!stagedAppPath) throw new Error('No staged update — download did not complete.');

  // Find the currently-installed .app by walking up from the running exe
  // (e.g. /Applications/CFG Invoicing.app/Contents/MacOS/CFG Invoicing).
  const exePath = app.getPath('exe');
  const installedAppPath = path.resolve(exePath, '..', '..', '..');

  const scriptPath = path.join(os.tmpdir(), `cfg-install-${Date.now()}.sh`);
  const stagedTmpRoot = path.dirname(path.dirname(stagedAppPath)); // tmpDir

  // Build script as a line-array to keep JS interpolation away from bash
  // ${...} expansions. Paths are single-quoted with single-quote-escape.
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const script = [
    '#!/bin/bash',
    'set -u',
    'LOG=/tmp/cfg-install-$$.log',
    'exec >> "$LOG" 2>&1',
    'echo "[$(date)] cfg installer starting"',
    '',
    `INSTALLED=${q(installedAppPath)}`,
    `STAGED=${q(stagedAppPath)}`,
    `TMP_DIR=${q(stagedTmpRoot)}`,
    `SELF=${q(scriptPath)}`,
    '',
    '# Wait for the old app processes to fully exit so file handles release.',
    'for i in 1 2 3 4 5; do',
    '  if ! pgrep -f "CFG Invoicing" >/dev/null; then break; fi',
    '  sleep 1',
    'done',
    'pkill -9 -f "CFG Invoicing" 2>/dev/null || true',
    'sleep 1',
    '',
    '# Move the old app out of the way so we can roll back on failure.',
    'BACKUP="${INSTALLED}.cfg-bak.$$"',
    'if [ -d "$INSTALLED" ]; then',
    '  mv "$INSTALLED" "$BACKUP" || { echo "mv old failed"; exit 1; }',
    'fi',
    '',
    '# Copy the staged new app into place.',
    'if cp -R "$STAGED" "$INSTALLED"; then',
    '  xattr -dr com.apple.quarantine "$INSTALLED" 2>/dev/null || true',
    '  ( sleep 8 && rm -rf "$BACKUP" ) &',
    '  open "$INSTALLED"',
    'else',
    '  echo "cp failed — restoring backup"',
    '  rm -rf "$INSTALLED"',
    '  mv "$BACKUP" "$INSTALLED"',
    '  open "$INSTALLED"',
    '  exit 1',
    'fi',
    '',
    'rm -rf "$TMP_DIR"',
    'rm -f "$SELF"',
    'echo "[$(date)] cfg installer done"',
    '',
  ].join('\n');

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  console.log(`[updater] launching installer ${scriptPath} → ${installedAppPath}`);

  // Spawn detached so it survives our quit
  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Give the script a moment to start, then quit ourselves
  setTimeout(() => app.quit(), 250);
}

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
