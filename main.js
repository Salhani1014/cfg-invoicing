const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const db = require('./src/db');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// DB handlers
ipcMain.handle('db:getClients', () => db.getClients());
ipcMain.handle('db:addClient', (_, data) => db.addClient(data));
ipcMain.handle('db:updateClient', (_, id, data) => db.updateClient(id, data));
ipcMain.handle('db:deleteClient', (_, id) => db.deleteClient(id));
ipcMain.handle('db:getInvoices', (_, clientId) => db.getInvoices(clientId));
ipcMain.handle('db:createInvoice', (_, data) => db.createInvoice(data));
ipcMain.handle('db:getAllInvoices', () => db.getAllInvoices());
ipcMain.handle('settings:get', (_, key) => db.getSetting(key));
ipcMain.handle('settings:set', (_, key, value) => db.setSetting(key, value));
ipcMain.handle('settings:getAll', () => db.getAllSettings());
ipcMain.handle('dialog:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));

const { generateInvoicePDF } = require('./src/pdf-generator');
const { sendInvoiceEmail, testConnection } = require('./src/mailer');

ipcMain.handle('pdf:generate', async (_, data) => {
  const result = await generateInvoicePDF(data);
  if (data.sendEmail) {
    await sendInvoiceEmail(result);
    db.markInvoiceEmailed(result.invoiceId);
  }
  return { success: true, pdfPath: result.pdfPath, invoiceNumber: result.invoiceNumber };
});

ipcMain.handle('mail:testConnection', async (_, config) => {
  await testConnection(config);
  return { success: true };
});
