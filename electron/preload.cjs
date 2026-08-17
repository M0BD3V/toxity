const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toxity', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  platform: process.platform,
});
