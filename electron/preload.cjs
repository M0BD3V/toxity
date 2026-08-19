const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toxity', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  platform: process.platform,
  listScreenSources: () => ipcRenderer.invoke('desktop:list-sources'),
  selectScreenSource: (sourceId) => ipcRenderer.invoke('desktop:select-source', sourceId),
  getActivity: () => ipcRenderer.invoke('app:activity'),
  onAuthLink: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on('auth:deep-link', listener);
    return () => ipcRenderer.removeListener('auth:deep-link', listener);
  },
});
