const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toxity', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  platform: process.platform,
  listScreenSources: () => ipcRenderer.invoke('desktop:list-sources'),
  selectScreenSource: (sourceId) => ipcRenderer.invoke('desktop:select-source', sourceId),
});
