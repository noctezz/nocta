// Lecteur mpv intégré (comme Stremio) : mpv dessine la vidéo dans une fenêtre
// native sans contenu web, et l'interface NOCTA s'affiche par-dessus dans une
// fenêtre transparente. mpv décode tout lui-même (MKV, HEVC, DTS, PGS…),
// avec une synchro image/son parfaite et le décodage matériel.
const { BaseWindow, BrowserWindow, app } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const OBSERVED = [
  'time-pos', 'duration', 'pause', 'paused-for-cache', 'cache-buffering-state', 'demuxer-cache-time',
  'track-list', 'volume', 'mute', 'speed', 'eof-reached', 'aid', 'sid', 'sub-delay', 'audio-delay', 'seeking',
];

let binCache;
function mpvBinary() {
  if (binCache !== undefined) return binCache;
  binCache = null;
  if (process.platform === 'darwin') return binCache; // --wid non géré ici : lecteur web
  const exe = process.platform === 'win32' ? 'mpv.exe' : 'mpv';
  const candidates = [
    path.join(process.resourcesPath || '', 'mpv', exe),
    path.join(__dirname, '..', 'vendor', 'mpv', exe),
  ];
  for (const c of candidates) if (c && fs.existsSync(c)) return (binCache = c);
  try {
    const r = spawnSync('mpv', ['--version'], { timeout: 5000, windowsHide: true });
    if (r.status === 0) binCache = 'mpv';
  } catch {}
  return binCache;
}

function handleOf(w) {
  const b = w.getNativeWindowHandle();
  if (process.platform === 'win32' && b.length >= 8) return b.readBigUInt64LE(0).toString();
  return String(b.readUInt32LE(0));
}

let counter = 0;

class MpvSession {
  constructor(main, loadRenderer) {
    this.main = main;
    this.loadRenderer = loadRenderer;
    this.proc = null;
    this.sock = null;
    this.reqId = 1;
    this.pending = new Map();
    this.closed = false;
    this.last = { time: 0, duration: 0 };
    this.info = {};
    this.props = {};
    this.started = false;
    this.onSync = () => this.syncBounds();
  }

  async start(req) {
    this.req = req;
    const bounds = this.main.getContentBounds();
    const common = {
      frame: false, show: false, resizable: false, movable: false, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, hasShadow: false, ...bounds,
    };

    // Fenêtre hôte : aucune page web, mpv y dessine directement
    this.host = new BaseWindow({ ...common, parent: this.main, backgroundColor: '#000000' });
    // Fenêtre d'interface transparente par-dessus la vidéo
    this.overlay = new BrowserWindow({
      ...common,
      parent: this.host,
      transparent: true,
      backgroundColor: '#00000000',
      focusable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.loadRenderer(this.overlay, { overlay: '1' });

    for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) {
      this.main.on(ev, this.onSync);
    }

    this.host.showInactive();
    this.overlay.show();
    this.overlay.focus();

    const pipe = process.platform === 'win32'
      ? `\\\\.\\pipe\\nocta-mpv-${process.pid}-${++counter}`
      : path.join(app.getPath('temp'), `nocta-mpv-${process.pid}-${++counter}.sock`);

    const subSize = Math.round(44 * ((req.subtitleSize || 100) / 100));
    const args = [
      '--no-config',
      `--wid=${handleOf(this.host)}`,
      `--input-ipc-server=${pipe}`,
      '--idle=yes', '--keep-open=yes', '--force-window=yes',
      '--osc=no', '--osd-level=0', '--osd-bar=no',
      '--input-default-bindings=no', '--input-vo-keyboard=no', '--input-cursor=no', '--cursor-autohide=no',
      '--hwdec=auto-safe',
      '--cache=yes', '--demuxer-max-bytes=512MiB', '--demuxer-max-back-bytes=128MiB', '--demuxer-readahead-secs=90',
      '--network-timeout=30', '--user-agent=NOCTA',
      `--volume=${Math.round((req.volume ?? 1) * 100)}`, '--volume-max=150',
      `--alang=${req.alang || 'fre,fra,fr,french,eng,en'}`,
      `--sub-font-size=${subSize}`, '--sub-bold=yes', '--sub-border-size=2.6', '--sub-shadow-offset=1.5',
      '--sub-margin-y=48', '--sub-ass-override=no',
      '--terminal=no', '--msg-level=all=warn', '--title=NOCTA',
    ];
    if (req.startAt && req.startAt > 5) args.push(`--start=${Math.max(0, req.startAt - 3).toFixed(1)}`);
    args.push('--', req.src);

    this.proc = spawn(mpvBinary(), args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errTail = '';
    this.proc.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-1500); });
    this.proc.on('exit', (code) => {
      if (!this.closed) {
        console.error('[mpv] exited', code, errTail);
        this.stop(code ? `mpv s'est arrêté (code ${code})` : undefined);
      }
    });
    this.proc.on('error', (err) => !this.closed && this.stop(String(err.message || err)));

    await this.connect(pipe);
    OBSERVED.forEach((p, i) => this.send(['observe_property', i + 1, p]));
  }

  connect(pipe) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const attempt = () => {
        if (this.closed) return reject(new Error('fermé'));
        const s = net.connect(pipe);
        s.once('connect', () => {
          this.sock = s;
          let buf = '';
          s.on('data', (d) => {
            buf += d.toString('utf8');
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i);
              buf = buf.slice(i + 1);
              if (line.trim()) this.onMessage(line);
            }
          });
          s.on('error', () => {});
          resolve();
        });
        s.once('error', () => {
          s.destroy();
          if (Date.now() - t0 > 10000) reject(new Error('mpv ne répond pas'));
          else setTimeout(attempt, 120);
        });
      };
      attempt();
    });
  }

  onMessage(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.request_id && this.pending.has(msg.request_id)) {
      const { resolve } = this.pending.get(msg.request_id);
      this.pending.delete(msg.request_id);
      resolve(msg);
      return;
    }
    if (msg.event === 'property-change') {
      this.props[msg.name] = msg.data;
      if (msg.name === 'time-pos' && typeof msg.data === 'number') this.last.time = msg.data;
      if (msg.name === 'duration' && typeof msg.data === 'number') this.last.duration = msg.data;
      this.sendOverlay('mpv:event', { name: msg.name, value: msg.data });
      if (msg.name === 'time-pos' || msg.name === 'duration') this.reportState();
    } else if (msg.event) {
      if (msg.event === 'playback-restart') this.started = true;
      if (msg.event === 'start-file') this.started = false;
      this.sendOverlay('mpv:event', { name: msg.event, value: msg.reason ?? msg.file_error ?? null });
    }
  }

  reportState() {
    const now = Date.now();
    if (this.lastReport && now - this.lastReport < 2000) return;
    this.lastReport = now;
    this.sendMain('player:state', { ...this.last });
  }

  send(command) {
    if (!this.sock || this.closed) return Promise.resolve(null);
    const request_id = this.reqId++;
    return new Promise((resolve) => {
      this.pending.set(request_id, { resolve });
      this.sock.write(JSON.stringify({ command, request_id }) + '\n');
      setTimeout(() => { if (this.pending.delete(request_id)) resolve(null); }, 5000);
    });
  }

  /** L'interface est prête : on lui envoie la lecture en cours et les infos connues */
  ready() {
    this.sendOverlay('player:init', this.req);
    this.sendOverlay('player:info', this.info);
    // Rattrape ce qui s'est passé avant que l'interface soit chargée
    for (const [name, value] of Object.entries(this.props)) this.sendOverlay('mpv:event', { name, value });
    if (this.started) this.sendOverlay('mpv:event', { name: 'playback-restart', value: null });
  }

  setInfo(info) {
    this.info = { ...this.info, ...info };
    this.sendOverlay('player:info', info);
  }

  /** Charge un autre fichier dans la même session (épisode suivant) */
  async load(req) {
    this.req = { ...this.req, ...req };
    this.last = { time: 0, duration: 0 };
    this.info = {};
    await this.send(['set_property', 'start', req.startAt && req.startAt > 5 ? String(Math.max(0, req.startAt - 3)) : 'none']);
    await this.send(['loadfile', req.src, 'replace']);
    this.sendOverlay('player:init', this.req);
  }

  syncBounds() {
    if (this.closed) return;
    const b = this.main.getContentBounds();
    this.host.setBounds(b);
    this.overlay.setBounds(b);
    // Les transitions plein écran se terminent parfois après l'événement
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      if (this.closed) return;
      const b2 = this.main.getContentBounds();
      this.host.setBounds(b2);
      this.overlay.setBounds(b2);
    }, 350);
  }

  sendOverlay(ch, data) {
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.webContents.send(ch, data);
  }

  sendMain(ch, data) {
    if (!this.main.isDestroyed()) this.main.webContents.send(ch, data);
  }

  stop(error) {
    if (this.closed) return;
    this.closed = true;
    for (const ev of ['move', 'resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) {
      this.main.removeListener(ev, this.onSync);
    }
    try { this.sock && this.sock.write(JSON.stringify({ command: ['quit'] }) + '\n'); } catch {}
    const proc = this.proc;
    setTimeout(() => { try { proc && !proc.killed && proc.kill(); } catch {} }, 800);
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.destroy();
    if (this.host && !this.host.isDestroyed()) this.host.destroy();
    if (!this.main.isDestroyed()) this.main.focus();
    if (!this.silent) this.sendMain('player:closed', { ...this.last, error });
    if (this.onStopped) this.onStopped();
  }
}

module.exports = { MpvSession, mpvBinary };
