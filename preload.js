const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    getClients: () => ipcRenderer.invoke('db:getClients'),
    addClient: (data) => ipcRenderer.invoke('db:addClient', data),
    updateClient: (id, data) => ipcRenderer.invoke('db:updateClient', id, data),
    deleteClient: (id) => ipcRenderer.invoke('db:deleteClient', id),
    getInvoices: (clientId) => ipcRenderer.invoke('db:getInvoices', clientId),
    createInvoice: (data) => ipcRenderer.invoke('db:createInvoice', data),
    getAllInvoices: () => ipcRenderer.invoke('db:getAllInvoices'),
  },
  pdf: {
    generate: (invoiceData, savePath) => ipcRenderer.invoke('pdf:generate', invoiceData, savePath),
  },
  mail: {
    send: (invoiceData, pdfPath) => ipcRenderer.invoke('mail:send', invoiceData, pdfPath),
    testConnection: (config) => ipcRenderer.invoke('mail:testConnection', config),
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  }
});
