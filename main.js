import { app, BrowserWindow, dialog, ipcMain, protocol, Menu, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Files are served from a custom scheme so ES modules, import maps and
// WebAssembly loading behave exactly as on a web server.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function serveApp() {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Maxi Tray',
    backgroundColor: '#e7e7e3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true
    }
  });
  win.loadURL('app://bundle/app/index.html');

  // Smoke test: MAXI_SNAPSHOT=out.png npm start  → saves a screenshot and quits.
  if (process.env.MAXI_SNAPSHOT) {
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message));
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      await writeFile(process.env.MAXI_SNAPSHOT, img.toPNG());
      app.quit();
    }, 3000));
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Some environments (restricted job objects, remote sessions, old drivers)
// crash Chromium's sandboxed GPU process, leaving WebGL disabled. Restart
// once without the GPU sandbox in that case; the app only loads local files.
const GPU_FALLBACK_FLAG = '--disable-gpu-sandbox';
let gpuCrashes = 0;
app.on('child-process-gone', (_e, details) => {
  if (details.type !== 'GPU' || process.argv.includes(GPU_FALLBACK_FLAG)) return;
  if (++gpuCrashes === 2) {
    app.relaunch({ args: [...process.argv.slice(1), GPU_FALLBACK_FLAG] });
    app.exit(0);
  }
});

ipcMain.handle('save-file', async (event, { defaultName, filters, data }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters
  });
  if (canceled || !filePath) return null;
  await writeFile(filePath, Buffer.from(data));
  return filePath;
});

// Writes several files into a folder picked by the user.
ipcMain.handle('save-files', async (event, { files }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Wybierz folder na części',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  for (const f of files) {
    await writeFile(path.join(filePaths[0], path.basename(f.name)), Buffer.from(f.data));
  }
  return filePaths[0];
});

ipcMain.handle('open-file', async (event, { filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  if (canceled || !filePaths.length) return null;
  return { path: filePaths[0], text: await readFile(filePaths[0], 'utf8') };
});

app.whenReady().then(() => {
  serveApp();
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
