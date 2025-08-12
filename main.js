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

  // Remove the default application menu bar
  win.removeMenu();

  // Determine URL: development server or production build
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'build', 'index.html')}`;
  win.loadURL(startUrl);
  // Open devtools when loading from dev server
  if (process.env.ELECTRON_START_URL) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 

// Simple file watch registry keyed by webContentsId
const watchersByWebContents = new Map();

function clearWatchersFor(webContentsId) {
  const existing = watchersByWebContents.get(webContentsId);
  if (existing && existing.watcher) {
    try { existing.watcher.close(); } catch {}
  }
  watchersByWebContents.delete(webContentsId);
}

// Open native file dialog from renderer
ipcMain.handle('open-file-dialog', async (event, options) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openFile'],
    ...options,
  });
  return result; // { canceled: boolean, filePaths: string[] }
});

// Read file content
ipcMain.handle('read-file', async (_event, filePath) => {
  const data = await fs.promises.readFile(filePath, 'utf-8');
  return data;
});

// Start watching a file for changes
ipcMain.on('watch-file', (event, filePath) => {
  const webContentsId = event.sender.id;
  // Clear previous watcher for this renderer if any
  clearWatchersFor(webContentsId);

  try {
    const watcher = fs.watch(filePath, { persistent: true }, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        // Debounce via microtask to compress bursts
        setTimeout(() => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('file-changed', { path: filePath, eventType });
          }
        }, 50);
      }
    });
    watchersByWebContents.set(webContentsId, { watcher, path: filePath });
  } catch (err) {
    // Forward error to renderer
    if (!event.sender.isDestroyed()) {
      event.sender.send('file-watch-error', { path: filePath, message: String(err?.message || err) });
    }
  }
});

// Stop watching
ipcMain.on('unwatch-file', (event) => {
  const webContentsId = event.sender.id;
  clearWatchersFor(webContentsId);
});

// Cleanup watchers when a renderer is destroyed
app.on('web-contents-destroyed', (_event, contents) => {
  clearWatchersFor(contents.id);
});