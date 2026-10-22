// Télécommande depuis le téléphone : petit serveur web sur le réseau local.
// Le téléphone scanne un QR code, ouvre la page télécommande (Safari, Chrome…)
// et pilote NOCTA en temps réel par WebSocket. Un code secret protège l'accès.
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const BASE_PORT = 7979;
const PAGE_DIR = path.join(__dirname, 'remote');

let cfgFile = null;
let cfg = { enabled: false, token: '' };
let server = null;
let wss = null;
let port = 0;
let lastError = null;
let handlers = { onMessage: () => {}, onClients: () => {}, getState: () => ({ mode: 'nav' }) };
let stateTimer = null;
let lastStateJson = '';

const newToken = () => crypto.randomBytes(12).toString('base64url');

function saveCfg() {
  try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)); } catch {}
}

const isTailscale = (name, ip) => /tailscale/i.test(name) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);

/**
 * Adresses IPv4 du PC : réseau local (la plus probable, Wi-Fi / Ethernet de la box, en premier)
 * et adresse Tailscale (réseau privé qui marche aussi en 4G).
 */
function addresses() {
  const lan = [], tailscale = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      if (isTailscale(name, a.address)) { tailscale.push(a.address); continue; }
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|ZeroTier|docker|^br-|^veth|vboxnet|utun|Bluetooth/i.test(name)) continue;
      const score = a.address.startsWith('192.168.') ? 0 : a.address.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3;
      lan.push({ address: a.address, score: score + (/wi-?fi|wlan|wireless|ethernet|^en|^eth/i.test(name) ? 0 : 0.5) });
    }
  }
  return { lan: lan.sort((a, b) => a.score - b.score).map((a) => a.address), tailscale };
}

const clients = () => (wss ? [...wss.clients].filter((c) => c.readyState === 1) : []);

function deviceName(ua = '') {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  return 'Téléphone';
}

function serveFile(res, file, type) {
  fs.readFile(path.join(PAGE_DIR, file), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    res.end(data);
  });
}

function onRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, 'index.html', 'text/html; charset=utf-8');
  if (url.pathname === '/icon.png' || url.pathname === '/apple-touch-icon.png') return serveFile(res, 'icon.png', 'image/png');
  if (url.pathname === '/manifest.webmanifest') {
    res.writeHead(200, { 'content-type': 'application/manifest+json' });
    res.end(JSON.stringify({
      name: 'NOCTA Télécommande', short_name: 'NOCTA', display: 'standalone', background_color: '#000000', theme_color: '#000000',
      start_url: `/?k=${url.searchParams.get('k') || ''}`, icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
    }));
    return;
  }
  res.writeHead(404); res.end();
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients()) c.send(data);
}

function pushState(force) {
  if (!clients().length) return;
  const json = JSON.stringify(handlers.getState());
  if (!force && json === lastStateJson) return;
  lastStateJson = json;
  broadcast({ t: 'state', ...JSON.parse(json) });
}

function listen(p, tries = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer(onRequest);
    srv.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && tries < 10) resolve(listen(p + 1, tries + 1));
      else { lastError = String(err.message || err); resolve(null); }
    });
    srv.listen(p, '0.0.0.0', () => { port = p; resolve(srv); });
  });
}

async function start() {
  if (server) return;
  lastError = null;
  const srv = await listen(BASE_PORT);
  if (!srv) return;
  server = srv;
  wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws, req) => {
    const k = new URL(req.url, 'http://x').searchParams.get('k');
    if (!k || k.length !== cfg.token.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(cfg.token))) {
      ws.close(4001, 'code');
      return;
    }
    ws.device = deviceName(req.headers['user-agent']);
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg && typeof msg.t === 'string') {
        handlers.onMessage(msg);
        setTimeout(() => pushState(), 120);
      }
    });
    ws.on('close', () => handlers.onClients(clients().length, null));
    handlers.onClients(clients().length, ws.device);
    lastStateJson = '';
    pushState(true);
  });
  stateTimer = setInterval(() => pushState(), 500);
}

function stop() {
  clearInterval(stateTimer);
  if (wss) { for (const c of wss.clients) c.terminate(); wss.close(); }
  if (server) server.close();
  wss = null;
  server = null;
  port = 0;
}

function init(userData, h) {
  cfgFile = path.join(userData, 'remote.json');
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch {}
  if (!cfg.token) { cfg.token = newToken(); saveCfg(); }
  handlers = { ...handlers, ...h };
  if (cfg.enabled) start();
}

const qrOf = (url) => QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0a0a0f', light: '#ffffff' } });

async function status() {
  const { lan, tailscale } = addresses();
  const link = (ip) => `http://${ip}:${port}/?k=${cfg.token}`;
  const urls = server ? lan.map(link) : [];
  const ts = server && tailscale[0] ? link(tailscale[0]) : null;
  return {
    enabled: cfg.enabled,
    running: !!server,
    error: cfg.enabled && !server ? lastError || 'Serveur indisponible' : null,
    url: urls[0] || null,
    urls,
    qr: urls[0] ? await qrOf(urls[0]) : null,
    tailscale: ts ? { url: ts, qr: await qrOf(ts) } : null,
    clients: clients().map((c) => c.device),
  };
}

async function setEnabled(v) {
  cfg.enabled = !!v;
  saveCfg();
  if (v) await start(); else stop();
  return status();
}

/** Nouveau code : les appareils déjà appairés sont déconnectés */
async function resetToken() {
  cfg.token = newToken();
  saveCfg();
  for (const c of clients()) c.close(4001, 'code');
  return status();
}

module.exports = { init, status, setEnabled, resetToken, pushState, stop, addresses, clientCount: () => clients().length };
