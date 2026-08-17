const { app, BrowserWindow, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('node:path');

const isDev = !app.isPackaged;
const selectedCaptureSources = new Map();

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0D0F14',
    title: 'Toxity',
    icon: path.join(__dirname, '..', 'assets', 'brand', 'icons', 'toxity.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const selectedId = selectedCaptureSources.get(window.webContents.id);
      const source = sources.find((item) => item.id === selectedId) ?? sources[0];
      selectedCaptureSources.delete(window.webContents.id);
      callback(source ? { video: source } : {});
    } catch {
      callback({});
    }
  });

  if (isDev) window.loadURL('http://127.0.0.1:5173');
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('desktop:list-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
});
ipcMain.handle('desktop:select-source', (event, sourceId) => {
  selectedCaptureSources.set(event.sender.id, sourceId);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
