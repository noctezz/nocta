const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./store.cjs');
const media = require('./media-server.cjs');
const torbox = require('./torbox.cjs');

const isDev = !!process.env.NOCTA_DEV;
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#000000',
    show: false,
    icon: fs.existsSync(path.join(__dirname, '..', 'build', 'icon.png')) ? path.join(__dirname, '..', 'build', 'icon.png') : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin'
      ? undefined
      : { color: '#00000000', symbolColor: '#ffffff', height: 36 },
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => win.show());

  // Liens externes -> navigateur système
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('enter-full-screen', () => win.webContents.send('win:fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win:fullscreen', false));

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- IPC ----------

// Stockage persistant (profils, réglages, addons)
ipcMain.on('store:load', (e) => { e.returnValue = store.load(); });
ipcMain.handle('store:save', (_e, data) => store.save(data));

// Requêtes HTTP depuis le process principal (pas de soucis de CORS)
ipcMain.handle('http:json', async (_e, url, opts = {}) => {
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: AbortSignal.timeout(opts.timeout || 20000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message || err) };
  }
});

ipcMain.handle('media:port', () => media.port());
ipcMain.handle('media:probe', (_e, src) => media.probe(src));
ipcMain.handle('media:capabilities', () => media.capabilities());
ipcMain.handle('media:keyframe', (_e, src, t) => media.keyframeBefore(src, t));

ipcMain.handle('torbox:call', (_e, method, ...args) => {
  if (typeof torbox[method] !== 'function') throw new Error('Méthode TorBox inconnue: ' + method);
  return torbox[method](...args);
});

ipcMain.handle('dialog:openVideo', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Ouvrir une vidéo',
    properties: ['openFile'],
    filters: [{ name: 'Vidéos', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm', 'm4v', 'ts', 'wmv', 'flv'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

ipcMain.handle('win:toggleFullscreen', () => {
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle('win:setFullscreen', (_e, v) => { win.setFullScreen(!!v); return win.isFullScreen(); });

// ---------- Cycle de vie ----------

app.whenReady().then(async () => {
  await media.start();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  media.stop();
  if (process.platform !== 'darwin') app.quit();
});
