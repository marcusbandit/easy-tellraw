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
  // Optionally open devtools in dev only when explicitly enabled
  if (process.env.ELECTRON_START_URL && process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
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

// Write file content (invoked explicitly from renderer)
ipcMain.handle('write-file', async (_event, filePath, content) => {
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return true;
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

// Ensure datapack folder contains pack.mcmeta and return/create appropriate Tellraw file
ipcMain.handle('ensure-tellraw-file', async (_event, datapackDir) => {
  try {
    if (!datapackDir || typeof datapackDir !== 'string') {
      return { ok: false, code: 'INVALID_PATH', message: 'No datapack directory provided.' };
    }
    const dirStat = await fs.promises.stat(datapackDir).catch(() => null);
    if (!dirStat || !dirStat.isDirectory()) {
      return { ok: false, code: 'NOT_DIRECTORY', message: 'Path is not a directory.' };
    }
    const packMetaPath = path.join(datapackDir, 'pack.mcmeta');
    const hasPackMcmeta = await fs.promises
      .stat(packMetaPath)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!hasPackMcmeta) {
      return { ok: false, code: 'NO_PACK_MCMETA', message: 'Folder does not contain pack.mcmeta.' };
    }
    // Always create/use Easy-Tellraw folder with Main.txt as default
    const easyFolder = path.join(datapackDir, 'Easy-Tellraw');
    await fs.promises.mkdir(easyFolder, { recursive: true });
    
    // Ensure Style.txt exists
const stylesPath = path.join(easyFolder, 'Style.txt');
    const stylesExists = await fs.promises
      .stat(stylesPath)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!stylesExists) {
      await fs.promises.writeFile(stylesPath, '', 'utf-8');
    }
    
    const filePath = path.join(easyFolder, 'Main.txt');
    const fileExists = await fs.promises
      .stat(filePath)
      .then((s) => s.isFile())
      .catch(() => false);
    if (!fileExists) {
      await fs.promises.writeFile(filePath, '', 'utf-8');
      return { ok: true, filePath, created: true };
    }
    return { ok: true, filePath, created: false };
  } catch (err) {
    return { ok: false, code: 'ERROR', message: String(err?.message || err) };
  }
});

// List all .txt files in the Easy-Tellraw folder
ipcMain.handle('list-tellraw-files', async (_event, datapackDir) => {
  try {
    if (!datapackDir || typeof datapackDir !== 'string') {
      return { ok: false, message: 'No datapack directory provided.' };
    }
    const easyFolder = path.join(datapackDir, 'Easy-Tellraw');
    const folderExists = await fs.promises
      .stat(easyFolder)
      .then((s) => s.isDirectory())
      .catch(() => false);
    if (!folderExists) {
      return { ok: true, files: [] };
    }
    const files = await fs.promises.readdir(easyFolder);
    const txtFiles = files
      .filter(f => f.endsWith('.txt'))
      .map(f => ({ 
        name: f.replace('.txt', ''), // Remove .txt extension for display
        fullName: f, // Keep full filename for file operations
        path: path.join(easyFolder, f),
        isStyles: f === 'Style.txt' // Mark Style.txt as special
      }))
      .sort((a, b) => {
        // Put Style.txt first, then sort alphabetically
if (a.isStyles) return -1;
if (b.isStyles) return 1;
        return a.name.localeCompare(b.name);
      });
    return { ok: true, files: txtFiles };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// Extract styles from content and move to Style.txt
ipcMain.handle('extract-styles-to-file', async (_event, datapackDir, content) => {
  try {
    if (!datapackDir || typeof datapackDir !== 'string') {
      return { ok: false, message: 'No datapack directory provided.' };
    }
    
    const easyFolder = path.join(datapackDir, 'Easy-Tellraw');
    const stylesPath = path.join(easyFolder, 'Style.txt');
    
    // Extract @styles...@endstyles content
    const stylesMatch = content.match(/@styles\s*([\s\S]*?)\s*@endstyles/i);
    if (stylesMatch) {
      const stylesContent = stylesMatch[1].trim();
      await fs.promises.writeFile(stylesPath, stylesContent, 'utf-8');
      
      // Remove styles section from original content
      const cleanedContent = content.replace(/@styles\s*[\s\S]*?\s*@endstyles\s*/gi, '').trim();
      
      return { ok: true, stylesContent, cleanedContent };
    }
    
    return { ok: true, stylesContent: '', cleanedContent: content };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// Rename a file in the Easy-Tellraw folder
ipcMain.handle('rename-tellraw-file', async (_event, oldPath, newName) => {
  try {
    if (!oldPath || !newName) {
      return { ok: false, message: 'Invalid parameters.' };
    }
    
    // Prevent renaming Style.txt
    if (path.basename(oldPath) === 'Style.txt') {
      return { ok: false, message: 'Style.txt cannot be renamed.' };
    }
    
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.promises.rename(oldPath, newPath);
    return { ok: true, newPath };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// Open directory picker dialog
ipcMain.handle('open-directory-dialog', async (event, options) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openDirectory'],
    ...options,
  });
  return result;
});

// File watcher management
const fileWatchers = new Map();

// Watch a directory for changes
ipcMain.handle('watch-directory', async (_event, datapackDir) => {
  try {
    if (!datapackDir || typeof datapackDir !== 'string') {
      return { ok: false, message: 'No datapack directory provided.' };
    }
    
    const easyFolder = path.join(datapackDir, 'Easy-Tellraw');
    
    // Stop any existing watcher for this directory
    if (fileWatchers.has(datapackDir)) {
      fileWatchers.get(datapackDir).close();
      fileWatchers.delete(datapackDir);
    }
    
    // Create new watcher
    const watcher = fs.watch(easyFolder, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.txt')) {
        // Notify all renderers about the file change
        BrowserWindow.getAllWindows().forEach(window => {
          window.webContents.send('file-changed', {
            eventType,
            filename,
            datapackDir,
            easyFolder
          });
        });
      }
    });
    
    fileWatchers.set(datapackDir, watcher);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// Stop watching a directory
ipcMain.handle('unwatch-directory', async (_event, datapackDir) => {
  try {
    if (fileWatchers.has(datapackDir)) {
      fileWatchers.get(datapackDir).close();
      fileWatchers.delete(datapackDir);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err?.message || err) };
  }
});

// Cleanup watchers when a renderer is destroyed
app.on('web-contents-destroyed', (_event, contents) => {
  // Stop all watchers when renderer is destroyed
  fileWatchers.forEach(watcher => watcher.close());
  fileWatchers.clear();
});