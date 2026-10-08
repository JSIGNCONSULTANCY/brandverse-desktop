const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('activation', {
  info: () => ipcRenderer.invoke('lic:info'),
  activate: (key) => ipcRenderer.invoke('lic:activate', key),
  quit: () => ipcRenderer.invoke('lic:quit')
});
