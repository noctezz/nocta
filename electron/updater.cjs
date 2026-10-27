// Mises à jour automatiques : NOCTA regarde sur GitHub s'il existe une version plus récente,
// la télécharge, puis lance l'installeur en silencieux et redémarre tout seul.
const { app, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const REPO = 'noctezz/nocta';
const variant = require('./variant.cjs');
const ASSET = variant.asset;
const CHECK_EVERY = 6 * 3600 * 1000;

let state = { state: 'idle', current: app.getVersion() };
let notify = () => {};
let latest = null;
let downloading = false;

const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;
const enabled = () => app.isPackaged && process.platform === 'win32';

function set(next) {
  state = { ...state, ...next, current: app.getVersion() };
  notify(state);
}

const parse = (v) => String(v || '').replace(/^(mini-)?v/, '').split('.').map((n) => parseInt(n, 10) || 0);
function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

/** Texte « Nouveautés » de la release (premier bloc avant le guide) */
function notesOf(body) {
  const m = /###\s*Nouveaut[ée]s\s*\n([\s\S]*?)(\n##\s|\n---|$)/i.exec(body || '');
  return m ? m[1].trim().slice(0, 1200) : '';
}

async function check({ manual } = {}) {
  if (!enabled()) {
    if (manual) set({ state: 'latest', note: 'Mises à jour disponibles seulement dans l\'app installée.' });
    return state;
  }
  if (downloading) return state;
  set({ state: 'checking', error: null });
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, {
      headers: { 'User-Agent': 'NOCTA', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const releases = await res.json();
    const nocta = releases
      .filter((r) => !r.draft && !r.prerelease && variant.tagRe.test(r.tag_name) && variant.nameRe.test(r.name || ''))
      .map((r) => ({ r, asset: (r.assets || []).find((a) => a.name === ASSET) }))
      .filter((x) => x.asset)
      .sort((a, b) => (newer(a.r.tag_name, b.r.tag_name) ? -1 : 1));
    const top = nocta[0];
    if (!top || !newer(top.r.tag_name, app.getVersion())) {
      latest = null;
      set({ state: 'latest', version: null, notes: null });
      return state;
    }
    latest = {
      version: top.r.tag_name.replace(/^(mini-)?v/, ''),
      url: top.asset.browser_download_url,
      size: top.asset.size,
      page: top.r.html_url,
      notes: notesOf(top.r.body),
    };
    set({ state: 'available', version: latest.version, notes: latest.notes, size: latest.size, portable: isPortable() });
  } catch (e) {
    set({ state: manual ? 'error' : 'idle', error: String(e && e.message || e) });
  }
  return state;
}

/** Télécharge puis installe (en silencieux) et relance NOCTA */
async function install() {
  if (!latest || downloading) return state;
  if (isPortable()) { shell.openExternal(latest.page); return state; }
  downloading = true;
  const dir = path.join(os.tmpdir(), 'nocta-update');
  const file = path.join(dir, `NOCTA-Setup-${latest.version}.exe`);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    set({ state: 'downloading', progress: 0 });
    const res = await fetch(latest.url, { headers: { 'User-Agent': 'NOCTA' }, redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status})`);
    const total = Number(res.headers.get('content-length')) || latest.size || 0;
    let got = 0, lastPct = -1;
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => {
      got += chunk.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; set({ state: 'downloading', progress: pct }); }
    });
    await pipeline(body, fs.createWriteStream(file));
    if (latest.size && fs.statSync(file).size !== latest.size) throw new Error('Fichier incomplet, réessaie');
    set({ state: 'installing', progress: 100 });
    // Installeur NSIS : /S = silencieux, --force-run = relance NOCTA à la fin
    const child = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    setTimeout(() => app.quit(), 800);
  } catch (e) {
    downloading = false;
    set({ state: 'error', error: String(e && e.message || e) });
  }
  return state;
}

function init(onState) {
  notify = onState;
  if (!enabled()) return;
  setTimeout(() => check(), 15000);
  setInterval(() => check(), CHECK_EVERY).unref();
}

module.exports = { init, check, install, status: () => state };
