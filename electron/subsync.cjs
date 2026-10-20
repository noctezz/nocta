// Recalage automatique des sous-titres (comme l'outil ffsubsync) : on écoute 3 passages de la
// vidéo (début, milieu, fin), on repère la parole, et on cherche le décalage qui colle le mieux
// aux sous-titres. Décalage fixe ou dérive progressive (25 / 23,976 images par seconde) corrigés.
// En cas de doute, les sous-titres restent tels quels : on ne les empire jamais.
const { app } = require('electron');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { FFMPEG, inputArgs } = require('./media-server.cjs');

const SR = 8000;
const CHUNK = 100; // secondes écoutées par passage
const OUT_DIR = path.join(os.tmpdir(), 'nocta-subs');

// ---------- Sous-titres : lecture / écriture ----------
function decodeText(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch {}
  return new TextDecoder('windows-1252').decode(buf);
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const toSec = (m) => (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;

/** Blocs SRT ou WebVTT → [{ a, b, text }] */
function parseSubs(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [l, r] = lines[i].split('-->');
    const ma = TIME.exec(l), mb = TIME.exec(r);
    if (!ma || !mb) continue;
    const body = lines.slice(i + 1).join('\n').trim();
    if (body) cues.push({ a: toSec(ma), b: toSec(mb), text: body });
  }
  return cues;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function fmt(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${fmt(c.a)} --> ${fmt(c.b)}\n${c.text}\n`).join('\n');

// ---------- Audio d'un passage (ffmpeg → PCM mono 8 kHz, voix filtrée) ----------
function decodeChunk(src, start) {
  return new Promise((resolve) => {
    const isUrl = /^https?:/i.test(src);
    const input = inputArgs(src);
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', start.toFixed(2), ...input,
      '-t', String(CHUNK), '-vn', '-sn', '-dn', '-ac', '1', '-ar', String(SR),
      '-af', 'highpass=f=200,lowpass=f=3200', '-f', 's16le', 'pipe:1'];
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    const timer = setTimeout(() => proc.kill('SIGKILL'), (isUrl ? 150 : 60) * 1000);
    proc.on('error', () => { clearTimeout(timer); resolve(null); });
    proc.on('close', () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (buf.length < SR * 2 * 20) return resolve(null);
      resolve(new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.floor(buf.length / 2) * 2)));
    });
  });
}

// Cadences d'image courantes : une VF faite pour une version 25 i/s dérive sur une version 23,976 i/s
const RATES = [23.976, 24, 25];
const SCALES = [1, ...RATES.flatMap((a) => RATES.filter((b) => b !== a).map((b) => a / b))];

// ---------- Thread de calcul ----------
let worker = null;
let wid = 0;
const waiting = new Map();
function shifts(pcm, start, cues) {
  if (!worker) {
    worker = new Worker(path.join(__dirname, 'subsync-worker.cjs').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep));
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
    worker.postMessage({ id, pcm, sr: SR, start, cues, scales: SCALES }, [pcm.buffer]);
  });
}

// ---------- Décision ----------
const FRAME = 0.02;
const PAD = 3000; // 60 s / 20 ms

/** Meilleur pic d'une courbe de scores, et netteté par rapport au 2e pic (à plus de 1,5 s) */
function peak(c) {
  let best = 0;
  for (let k = 1; k < c.length; k++) if (c[k] > c[best]) best = k;
  let mean = 0; for (let k = 0; k < c.length; k++) mean += c[k]; mean /= c.length;
  let v = 0; for (let k = 0; k < c.length; k++) v += (c[k] - mean) ** 2;
  const std = Math.sqrt(v / c.length) || 1;
  let second = -Infinity;
  for (let k = 0; k < c.length; k++) if (Math.abs(k - best) > 75 && c[k] > second) second = c[k];
  return { k: best, delta: (best - PAD) * FRAME, value: c[best], z: (c[best] - mean) / std, ratio: (c[best] - mean) / Math.max(1e-9, second - mean) };
}

/**
 * chunks : pour chaque passage écouté, les courbes de scores par vitesse.
 * Les passages sont additionnés (mesure commune, plus précise) ; la correction n'est retenue que
 * si le pic commun est net ET qu'au moins 2 passages, pris seuls, pointent au même endroit :
 * le hasard ne donne jamais deux fois le même résultat.
 */
function decide(chunks) {
  const cands = [];
  for (let si = 0; si < SCALES.length; si++) {
    const curves = chunks.map((c) => c && c[si]).filter(Boolean);
    if (curves.length < 2) continue;
    const sum = new Float32Array(curves[0].length);
    for (const c of curves) for (let k = 0; k < sum.length; k++) sum[k] += c[k];
    const p = peak(sum);
    const agree = curves.filter((c) => Math.abs(peak(c).k - p.k) * FRAME <= 1).length;
    cands.push({ scale: SCALES[si], ...p, agree });
  }
  // Seuils calibrés : un vrai décalage donne un pic net (z ≈ 5,5, 3× plus haut que le suivant),
  // des sous-titres sans rapport plafonnent vers z 3,5 et un pic à peine plus haut que les autres
  const ok = cands.filter((c) => c.agree >= 2 && c.ratio >= 2 && c.z >= 4.5);
  if (!ok.length) return null;
  ok.sort((a, b) => b.value - a.value);
  let best = ok[0];
  // Vitesse normale privilégiée si elle fait presque aussi bien
  const normal = ok.find((c) => c.scale === 1);
  if (normal && normal.value >= best.value * 0.97) best = normal;
  return { scale: best.scale, offset: best.delta, agree: best.agree, z: best.z, ratio: best.ratio };
}

const cache = new Map();

/**
 * Vérifie et, si besoin, recale des sous-titres pour une vidéo.
 * Renvoie { status: 'ok' | 'synced' | 'unsure', file?, offset, scale }.
 */
async function sync({ src, url, duration }) {
  const key = crypto.createHash('sha1').update(`${src}|${url}`).digest('hex');
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'NOCTA' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Sous-titres indisponibles (${res.status})`);
    const cues = parseSubs(decodeText(Buffer.from(await res.arrayBuffer())));
    if (cues.length < 20) return { status: 'unsure' };
    const end = Math.max(duration || 0, cues[cues.length - 1].b);
    // 3 passages répartis sur la vidéo (évite le générique du début et celui de fin)
    const starts = [0.18, 0.5, 0.78].map((f) => Math.max(0, Math.min(end - CHUNK - 5, end * f)));
    // Un sous-titre reste souvent affiché un peu après la fin de la phrase : on ne garde que
    // sa partie « parlée » pour caler sur le début des répliques, pas sur leur milieu
    const plain = cues.map((c) => [c.a, Math.max(c.a + 0.5, c.b - Math.min(0.6, 0.25 * (c.b - c.a)))]);
    const chunks = [];
    for (const start of starts) {
      const pcm = await decodeChunk(src, start);
      chunks.push(pcm ? await shifts(pcm, start, plain).catch(() => null) : null);
    }
    const fix = decide(chunks);
    if (!fix) return { status: 'unsure' };
    // Déjà bien calés : même vitesse et moins de 0,4 s d'écart
    if (fix.scale === 1 && Math.abs(fix.offset) < 0.4) return { status: 'ok', offset: fix.offset, scale: 1 };
    const fixed = cues.map((c) => ({ ...c, a: c.a * fix.scale + fix.offset, b: c.b * fix.scale + fix.offset })).filter((c) => c.b > 0);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${key}.srt`);
    fs.writeFileSync(file, toSrt(fixed));
    return { status: 'synced', file, offset: fix.offset, scale: fix.scale };
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}

app.on('will-quit', () => { try { fs.rmSync(OUT_DIR, { recursive: true, force: true }); } catch {} });

module.exports = { sync };
