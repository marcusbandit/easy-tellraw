const { app, BrowserWindow, ipcMain, dialog } = require('electron');
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.removeMenu();
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'index.html')}`;
  win.loadURL(startUrl);
  if (process.env.ELECTRON_START_URL) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// File watching and dialog helpers for dev server
const watchersByWebContents = new Map();
function clearWatchersFor(webContentsId) {
  const existing = watchersByWebContents.get(webContentsId);
  if (existing && existing.watcher) {
    try { existing.watcher.close(); } catch {}
  }
  watchersByWebContents.delete(webContentsId);
}

ipcMain.handle('open-file-dialog', async (event, options) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openFile'],
    ...options,
  });
  return result;
});

ipcMain.handle('read-file', async (_event, filePath) => {
  const data = await fs.promises.readFile(filePath, 'utf-8');
  return data;
});

ipcMain.handle('write-file', async (_event, filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.on('watch-file', (event, filePath) => {
  const webContentsId = event.sender.id;
  clearWatchersFor(webContentsId);
  try {
    const watcher = fs.watch(filePath, { persistent: true }, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        setTimeout(() => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('file-changed', { path: filePath, eventType });
          }
        }, 50);
      }
    });
    watchersByWebContents.set(webContentsId, { watcher, path: filePath });
  } catch (err) {
    if (!event.sender.isDestroyed()) {
      event.sender.send('file-watch-error', { path: filePath, message: String(err?.message || err) });
    }
  }
});

ipcMain.on('unwatch-file', (event) => {
  const webContentsId = event.sender.id;
  clearWatchersFor(webContentsId);
});