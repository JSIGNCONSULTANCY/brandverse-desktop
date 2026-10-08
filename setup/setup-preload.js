const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bvSetup', {
  defaults: () => ipcRenderer.invoke('setup:defaults'),
  browse: (current) => ipcRenderer.invoke('setup:browse', current),
  finish: (cfg) => ipcRenderer.invoke('setup:finish', cfg),
  cancel: () => ipcRenderer.invoke('setup:cancel')
});
