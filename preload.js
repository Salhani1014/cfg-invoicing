const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    getClients:           ()            => ipcRenderer.invoke('db:getClients'),
    addClient:            (data)        => ipcRenderer.invoke('db:addClient', data),
    updateClient:         (id, data)    => ipcRenderer.invoke('db:updateClient', id, data),
    deleteClient:         (id)          => ipcRenderer.invoke('db:deleteClient', id),
    getInvoices:          (clientId)    => ipcRenderer.invoke('db:getInvoices', clientId),
    createInvoice:        (data)        => ipcRenderer.invoke('db:createInvoice', data),
    getAllInvoices:        ()            => ipcRenderer.invoke('db:getAllInvoices'),
    markInvoicePaid:      (id)          => ipcRenderer.invoke('db:markInvoicePaid', id),
    deleteInvoice:        (id)          => ipcRenderer.invoke('db:deleteInvoice', id),
    getLastClientInvoice: (clientId)    => ipcRenderer.invoke('db:getLastClientInvoice', clientId),
    markReminderSent:     (id)          => ipcRenderer.invoke('db:markReminderSent', id),
    updateInvoiceNotes:   (id, notes)   => ipcRenderer.invoke('db:updateInvoiceNotes', id, notes),
    getSchemaVersion:     ()            => ipcRenderer.invoke('db:getSchemaVersion'),
  },
  pdf: {
    generate:     (data)      => ipcRenderer.invoke('pdf:generate', data),
    generatePaid: (data)      => ipcRenderer.invoke('pdf:generatePaid', data),
    regenerate:   (invoiceId) => ipcRenderer.invoke('pdf:regenerate', invoiceId),
  },
  mail: {
    testConnection:  (config)     => ipcRenderer.invoke('mail:testConnection', config),
    sendPaidReceipt: (data)       => ipcRenderer.invoke('mail:sendPaidReceipt', data),
    sendInvoiceAgain:(data)       => ipcRenderer.invoke('mail:sendInvoiceAgain', data),
    sendReminder:    (data)       => ipcRenderer.invoke('mail:sendReminder', data),
  },
  settings: {
    get:    (key)        => ipcRenderer.invoke('settings:get', key),
    set:    (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: ()           => ipcRenderer.invoke('settings:getAll'),
  },
  userConfig: {
    isConfigured: ()     => ipcRenderer.invoke('userConfig:isConfigured'),
    getConfig:    ()     => ipcRenderer.invoke('userConfig:getConfig'),
    save:         (data) => ipcRenderer.invoke('userConfig:save', data),
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  },
  shell: {
    openPath:     (p)   => ipcRenderer.invoke('shell:openPath', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  }
});
