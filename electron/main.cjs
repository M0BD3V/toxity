const { app, BrowserWindow, desktopCapturer, ipcMain, shell, Tray, Menu, powerMonitor } = require('electron');
const path = require('node:path');

const isDev = process.argv.includes('--dev');
const selectedCaptureSources = new Map();
const appIcon = path.join(__dirname, '..', 'assets', 'brand', 'icons', 'toxity.ico');
let mainWindow = null;
let tray = null;
let quitting = false;

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  tray = new Tray(appIcon);
  tray.setToolTip('Toxity');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Toxity', click: showWindow },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('double-click', showWindow);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0D0F14',
    title: 'Toxity',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });

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
      callback(source ? { video: source, audio: 'loopback' } : {});
    } catch {
      callback({});
    }
  });

  if (isDev) window.loadURL('http://127.0.0.1:5173');
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return window;
}

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:activity', () => ({ focused: Boolean(mainWindow?.isFocused()), visible: Boolean(mainWindow?.isVisible()), idleSeconds: powerMonitor.getSystemIdleTime() }));
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
  createTray();
  createWindow();
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });
