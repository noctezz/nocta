const { app, BrowserWindow, ipcMain, dialog, shell, session: electronSession } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const store = require('./store.cjs');
const media = require('./media-server.cjs');
const { MpvSession, mpvBinary } = require('./mpv.cjs');

const isDev = !!process.env.NOCTA_DEV;
let win;
let session = null;

function loadRenderer(w, query) {
  if (isDev) w.loadURL('http://127.0.0.1:5173/' + (query ? '?' + new URLSearchParams(query) : ''));
  else w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), query ? { query } : undefined);
}

// Mémorise le plein écran entre deux lancements
const winStateFile = () => path.join(app.getPath('userData'), 'window.json');
function readWinState() {
  try { return JSON.parse(fs.readFileSync(winStateFile(), 'utf8')); } catch { return {}; }
}
function writeWinState(state) {
  try { fs.writeFileSync(winStateFile(), JSON.stringify(state)); } catch {}
}

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

  const state = readWinState();
  win.once('ready-to-show', () => {
    win.show();
    if (state.fullscreen) win.setFullScreen(true);
  });

  // Bouton « agrandir » = vrai plein écran (sans la barre des tâches), comme une app TV
  win.on('maximize', () => {
    if (process.platform === 'darwin') return;
    win.unmaximize();
    win.setFullScreen(true);
  });
  // F11 bascule le plein écran
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // Liens externes -> navigateur système
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('enter-full-screen', () => { win.webContents.send('win:fullscreen', true); writeWinState({ fullscreen: true }); });
  win.on('leave-full-screen', () => { win.webContents.send('win:fullscreen', false); writeWinState({ fullscreen: false }); });

  win.on('closed', () => { if (session) session.stop(); });
  loadRenderer(win);
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


// ---------- Lecteur mpv intégré ----------
ipcMain.handle('player:available', () => !!mpvBinary());
ipcMain.handle('player:open', async (_e, req) => {
  if (session) session.stop();
  const s = new MpvSession(win, loadRenderer);
  session = s;
  s.onStopped = () => { if (session === s) session = null; };
  try {
    await s.start(req);
    return { ok: true };
  } catch (err) {
    s.silent = true;
    s.stop(String(err && err.message || err));
    return { ok: false, error: String(err && err.message || err) };
  }
});
ipcMain.handle('player:load', (_e, req) => session && session.load(req));
ipcMain.handle('player:cmd', (_e, args) => session ? session.send(args).then((r) => r && r.data) : null);
ipcMain.handle('player:close', () => session && session.stop());
ipcMain.handle('player:info', (_e, info) => session && session.setInfo(info));
ipcMain.handle('player:ready', () => session && session.ready());
ipcMain.handle('player:next', () => session && session.sendMain('player:next'));
ipcMain.handle('player:fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return !win.isFullScreen(); });
ipcMain.handle('player:minimize', () => win.minimize());

ipcMain.handle('dialog:openVideo', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Ouvrir une vidéo',
    properties: ['openFile'],
    filters: [{ name: 'Vidéos', extensions: ['mkv', 'mp4', 'avi', 'mov', 'webm', 'm4v', 'ts', 'wmv', 'flv'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('win:isFullscreen', () => win.isFullScreen());

// ---------- Configuration / installation d'addons ----------
// Ouvre la page de configuration d'un addon (ou stremio-addons.net) dans une fenêtre.
// Les boutons « Install » de ces pages ouvrent un lien stremio://… : on l'intercepte
// pour installer l'addon directement dans NOCTA.
let addonsWin = null;
function openAddonsWindow(url) {
  if (addonsWin && !addonsWin.isDestroyed()) { addonsWin.loadURL(url); addonsWin.focus(); return; }
  const ses = electronSession.fromPartition('persist:addons');
  if (!ses.protocol.isProtocolHandled('stremio')) {
    ses.protocol.handle('stremio', (req) => {
      installFrom(req.url);
      return new Response('<html><body style="background:#111"></body></html>', { headers: { 'content-type': 'text/html' } });
    });
  }
  addonsWin = new BrowserWindow({
    parent: win,
    width: 1180,
    height: 820,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    title: 'NOCTA · Addons',
    webPreferences: { partition: 'persist:addons', contextIsolation: true, nodeIntegration: false },
  });
  const intercept = (e, target) => {
    if (/^stremio:/i.test(target)) { if (e) e.preventDefault(); installFrom(target); return true; }
    return false;
  };
  addonsWin.webContents.on('will-navigate', (e, target) => intercept(e, target));
  addonsWin.webContents.on('will-frame-navigate', (e) => intercept(e, e.url));
  addonsWin.webContents.setWindowOpenHandler(({ url: target }) => {
    if (intercept(null, target)) return { action: 'deny' };
    addonsWin.loadURL(target);
    return { action: 'deny' };
  });
  addonsWin.on('closed', () => { addonsWin = null; });
  addonsWin.loadURL(url);
}
function installFrom(stremioUrl) {
  const manifestUrl = stremioUrl.replace(/^stremio:\/\//i, 'https://');
  if (win && !win.isDestroyed()) {
    win.webContents.send('addons:install', manifestUrl);
    win.focus();
  }
  if (addonsWin && !addonsWin.isDestroyed()) addonsWin.close();
}
ipcMain.handle('addons:openWindow', (_e, url) => openAddonsWindow(url));

ipcMain.handle('app:openLogs', () => shell.openPath(app.getPath('userData')));
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
  if (session) session.stop();
  if (process.platform !== 'darwin') app.quit();
});
