// Calculs du recalage des sous-titres (thread séparé) : pour un passage de la vidéo, on mesure
// à quel point « les moments où ça parle » et « les moments où un sous-titre est affiché »
// se superposent, pour chaque décalage possible et chaque vitesse candidate.
const { parentPort } = require('node:worker_threads');

const FRAME = 0.02; // 20 ms par case
const MAX_SHIFT = 60; // décalage cherché : ±60 s

/** Parole (1) ou pas (-1) par case de 20 ms, d'après l'énergie de la voix (seuils relatifs au passage) */
function speechCurve(pcm, sr) {
  const step = Math.round(sr * FRAME);
  const n = Math.floor(pcm.length / step);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * step; j < (i + 1) * step; j++) sum += pcm[j] * pcm[j];
    e[i] = Math.log10(sum / step + 1);
  }
  const sorted = Float32Array.from(e).sort();
  const lo = sorted[Math.floor(n * 0.2)] || 0;
  const hi = sorted[Math.floor(n * 0.95)] || lo + 1;
  const th = lo + 0.35 * Math.max(0.3, hi - lo);
  // Lissage : les petits silences entre les mots comptent comme de la parole
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = e[i] > th ? 1 : 0;
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += raw[i + k] || 0;
    out[i] = s >= 4 ? 1 : -1;
  }
  return out;
}

/**
 * Pour chaque vitesse, les scores normalisés de chaque décalage (−60 s à +60 s, pas de 20 ms)
 * sur le passage [start, start + durée] de la vidéo. Au décalage d, le sous-titre de l'instant s
 * s'afficherait à s × vitesse + d. null quand le passage n'a pas de dialogue sous-titré.
 */
function scoreCurves(pcm, sr, start, cues, scales) {
  const sp = speechCurve(pcm, sr);
  const n = sp.length;
  const pad = Math.round(MAX_SHIFT / FRAME);
  const total = n + 2 * pad;
  const t0 = start - MAX_SHIFT;
  const nk = 2 * pad + 1;
  const out = [];
  for (const scale of scales) {
    const sub = new Int8Array(total).fill(-1);
    let on = 0;
    for (const [a0, b0] of cues) {
      const a = a0 * scale, b = b0 * scale;
      if (b < t0 || a > t0 + total * FRAME) continue;
      const i0 = Math.max(0, Math.floor((a - t0) / FRAME));
      const i1 = Math.min(total, Math.ceil((b - t0) / FRAME));
      for (let i = i0; i < i1; i++) { if (sub[i] < 0) on++; sub[i] = 1; }
    }
    if (on < total * 0.05) { out.push(null); continue; }
    // score(k) : accord parole / sous-titre quand la parole de l'instant i correspond au sous-titre i + 2·pad − k
    const scores = new Float32Array(nk);
    for (let k = 0; k < nk; k++) {
      let s = 0;
      const off = 2 * pad - k;
      for (let i = 0; i < n; i++) s += sp[i] * sub[i + off];
      scores[k] = s;
    }
    // Normalisés (moyenne 0, écart-type 1) : les passages s'additionnent ensuite à égalité
    let mean = 0; for (let k = 0; k < nk; k++) mean += scores[k]; mean /= nk;
    let v = 0; for (let k = 0; k < nk; k++) v += (scores[k] - mean) ** 2;
    const std = Math.sqrt(v / nk) || 1;
    for (let k = 0; k < nk; k++) scores[k] = (scores[k] - mean) / std;
    out.push(scores);
  }
  return out;
}

parentPort.on('message', ({ id, pcm, sr, start, cues, scales }) => {
  try {
    const result = scoreCurves(pcm, sr, start, cues, scales);
    parentPort.postMessage({ id, result }, result.filter(Boolean).map((a) => a.buffer));
  } catch (e) {
    parentPort.postMessage({ id, error: String(e && e.message || e) });
  }
});
