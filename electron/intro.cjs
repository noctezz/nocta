// Détection automatique du générique (même principe que le plugin « Intro Skipper » de Jellyfin) :
// on calcule une empreinte audio du début de deux épisodes d'une même série, puis on cherche
// le plus long passage commun. La musique du générique est identique d'un épisode à l'autre.
const { app } = require('electron');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const { FFMPEG, inputArgs } = require('./media-server.cjs');

const SR = 8000; // Hz : suffisant pour reconnaître une musique
const SECONDS = 480; // début analysé : 8 minutes (paramètres de l'empreinte : intro-worker.cjs)

// ---------- Cache disque des empreintes ----------
const enc = (s) => encodeURIComponent(s).replace(/[*.]/g, (c) => '%' + c.charCodeAt(0).toString(16));
const dir = (seriesId) => path.join(app.getPath('userData'), 'intro', enc(seriesId));
const file = (seriesId, videoId) => path.join(dir(seriesId), `${enc(videoId)}.fp`);

function saveFp(seriesId, videoId, fp) {
  fs.mkdirSync(dir(seriesId), { recursive: true });
  const buf = Buffer.alloc(fp.bits.length * 5);
  for (let i = 0; i < fp.bits.length; i++) { buf.writeUInt32LE(fp.bits[i], i * 5); buf[i * 5 + 4] = fp.loud[i]; }
  fs.writeFileSync(file(seriesId, videoId), buf);
}

function loadFp(seriesId, videoId) {
  try {
    const buf = fs.readFileSync(file(seriesId, videoId));
    const n = Math.floor(buf.length / 5);
    const bits = new Uint32Array(n);
    const loud = new Uint8Array(n);
    for (let i = 0; i < n; i++) { bits[i] = buf.readUInt32LE(i * 5); loud[i] = buf[i * 5 + 4]; }
    return { bits, loud };
  } catch {
    return null;
  }
}

function cachedIds(seriesId) {
  try { return fs.readdirSync(dir(seriesId)).filter((f) => f.endsWith('.fp')).map((f) => decodeURIComponent(f.slice(0, -3))); } catch { return []; }
}

// ---------- Décodage audio (ffmpeg → PCM mono 8 kHz) ----------
function decode(src) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', ...inputArgs(src),
      '-t', String(SECONDS), '-vn', '-sn', '-dn', '-ac', '1', '-ar', String(SR), '-f', 's16le', 'pipe:1'];
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    const timer = setTimeout(() => proc.kill('SIGKILL'), 6 * 60 * 1000);
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (buf.length < SR * 2 * 30) return reject(new Error('audio trop court'));
      resolve(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)));
    });
  });
}

// ---------- Calculs dans un thread séparé (l'interface ne gèle pas) ----------
let worker = null;
let wid = 0;
const waiting = new Map();
function run(op, payload, transfer = []) {
  if (!worker) {
    worker = new Worker(path.join(__dirname, 'intro-worker.cjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep));
    worker.on('message', ({ id, result, error }) => {
      const w = waiting.get(id);
      waiting.delete(id);
      if (w) (error ? w.reject(new Error(error)) : w.resolve(result));
    });
    worker.on('error', (e) => { for (const w of waiting.values()) w.reject(e); waiting.clear(); worker = null; });
    worker.unref();
  }
  const id = ++wid;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, op, ...payload }, transfer);
  });
}

// ---------- File d'attente : une analyse à la fois ----------
const inflight = new Map();
let queue = Promise.resolve();

function getFp(seriesId, video) {
  const cached = loadFp(seriesId, video.id);
  if (cached) return Promise.resolve(cached);
  if (!video.src) return Promise.resolve(null);
  const key = `${seriesId}|${video.id}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = queue.then(async () => {
    const pcm = await decode(video.src);
    const copy = pcm.slice();
    const fp = await run('fingerprint', { pcm: copy.buffer }, [copy.buffer]);
    saveFp(seriesId, video.id, fp);
    return fp;
  }).finally(() => inflight.delete(key));
  queue = job.catch(() => {});
  inflight.set(key, job);
  return job;
}

/**
 * Détecte le générique de l'épisode `a` en le comparant à l'épisode `b`
 * (puis aux autres épisodes déjà analysés de la série).
 * Renvoie { [videoId]: { start, end } } pour chaque épisode où il a été trouvé.
 */
async function detect({ seriesId, a, b }) {
  const out = {};
  const fpA = await getFp(seriesId, a).catch(() => null);
  if (!fpA) return out;
  const others = [];
  if (b) others.push(b);
  for (const id of cachedIds(seriesId)) if (id !== a.id && (!b || id !== b.id)) others.push({ id });
  for (const o of others.slice(0, 4)) {
    const fpB = await getFp(seriesId, o).catch(() => null);
    if (!fpB) continue;
    const r = await run('compare', { A: fpA, B: fpB });
    if (r) {
      out[a.id] = r.a;
      out[o.id] = r.b;
      break;
    }
  }
  return out;
}

const hasFp = (seriesId, videoId) => fs.existsSync(file(seriesId, videoId));

module.exports = { detect, hasFp, _test: { decode, run } };
