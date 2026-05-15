const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('APP_VERSION', process.env.npm_package_version || require('./package.json').version);

contextBridge.exposeInMainWorld('api', {
  auth: {
    status:    ()                 => ipcRenderer.invoke('auth:status'),
    signIn:    (email, password)  => ipcRenderer.invoke('auth:signIn', email, password),
    sendOtp:   (email)            => ipcRenderer.invoke('auth:sendOtp', email),
    verifyOtp: (email, token)     => ipcRenderer.invoke('auth:verifyOtp', email, token),
    signOut:   ()                 => ipcRenderer.invoke('auth:signOut'),
  },
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
    getContractors:           ()            => ipcRenderer.invoke('db:getContractors'),
    addContractor:            (data)        => ipcRenderer.invoke('db:addContractor', data),
    updateContractor:         (id, data)    => ipcRenderer.invoke('db:updateContractor', id, data),
    deleteContractor:         (id)          => ipcRenderer.invoke('db:deleteContractor', id),
    getContractorPayments:    (id)          => ipcRenderer.invoke('db:getContractorPayments', id),
    updateContractorPayment:  (id, data)    => ipcRenderer.invoke('db:updateContractorPayment', id, data),
    deleteContractorPayment:  (id)          => ipcRenderer.invoke('db:deleteContractorPayment', id),
  },
  pdf: {
    generate:     (data)      => ipcRenderer.invoke('pdf:generate', data),
    generatePaid: (data)      => ipcRenderer.invoke('pdf:generatePaid', data),
    regenerate:      (invoiceId) => ipcRenderer.invoke('pdf:regenerate', invoiceId),
    generatePayStub: (data)      => ipcRenderer.invoke('pdf:generatePayStub', data),
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
  },
  contractors: {
    exportCsv:        (params) => ipcRenderer.invoke('contractors:exportCsv', params),
    exportSummaryPdf: (params) => ipcRenderer.invoke('contractors:exportSummaryPdf', params),
  },
  updater: {
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
    onDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_, p) => cb(p)),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
    onError: (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),
    download: () => ipcRenderer.invoke('autoUpdater:download'),
    install: () => ipcRenderer.invoke('autoUpdater:install'),
    checkNow: () => ipcRenderer.invoke('updater:checkNow'),
  },
  timeTracking: {
    listEmployees:          ()                       => ipcRenderer.invoke('tt:listEmployees'),
    createEmployee:         (data)                   => ipcRenderer.invoke('tt:createEmployee', data),
    updateEmployee:         (id, patch)              => ipcRenderer.invoke('tt:updateEmployee', id, patch),
    unbindDevice:           (employeeId)             => ipcRenderer.invoke('tt:unbindDevice', employeeId),
    listShifts:             (employeeId, week)       => ipcRenderer.invoke('tt:listShifts', employeeId, week),
    listWifiEventsForShift: (shiftId)                => ipcRenderer.invoke('tt:listWifiEventsForShift', shiftId),
    editShift:              (id, patch, adminId)     => ipcRenderer.invoke('tt:editShift', id, patch, adminId),
    closeShiftViaAudit:     (shiftId, adminId)       => ipcRenderer.invoke('tt:closeShiftViaAudit', shiftId, adminId),
    listOpenMismatches:     ()                       => ipcRenderer.invoke('tt:listOpenMismatches'),
    liveStatus:             ()                       => ipcRenderer.invoke('tt:liveStatus'),
  },
});
