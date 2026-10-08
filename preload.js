const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bvDesktop', {
  isDesktop: true,
  loadSync: () => ipcRenderer.sendSync('bv:load-sync'),
  saveState: (text) => ipcRenderer.invoke('bv:save', text),
  saveStateSync: (text) => ipcRenderer.sendSync('bv:save-sync', text),
  saveExport: (name, bytes) => ipcRenderer.invoke('bv:save-export', name, bytes),
  saveExportAs: (name, bytes) => ipcRenderer.invoke('bv:save-export-as', name, bytes),
  fetchJSON: (url, ms) => ipcRenderer.invoke('bv:fetch-json', url, ms),
  info: () => ipcRenderer.invoke('bv:info'),
  openPath: (which) => ipcRenderer.invoke('bv:open-path', which),
  changeFolder: (which) => ipcRenderer.invoke('bv:change-folder', which),
  backupNow: () => ipcRenderer.invoke('bv:backup-now'),
  listBackups: () => ipcRenderer.invoke('bv:list-backups'),
  readBackup: (name) => ipcRenderer.invoke('bv:read-backup', name),
  openExternal: (url) => ipcRenderer.invoke('bv:open-external', url),
  lic: {
    summary: () => ipcRenderer.invoke('bv:lic-summary'),
    call: (route, body) => ipcRenderer.invoke('bv:lic-call', route, body),
    validate: () => ipcRenderer.invoke('bv:lic-validate'),
    deactivate: () => ipcRenderer.invoke('bv:lic-deactivate')
  }
});
