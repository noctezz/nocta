// Calculs lourds de la détection de générique, hors du processus principal
const { parentPort } = require('node:worker_threads');

const SR = 8000;
const N = 2048;
const HOP = 1024;
const STEP = HOP / SR;
const BANDS = 33;
const MIN_INTRO = 15;
const MAX_INTRO = 150;
const MAX_ERR = 9;
const MAX_GAP = 8;

// ---------- Empreinte (Haitsma–Kalker) ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function fingerprint(pcm) {
  const frames = Math.floor((pcm.length - N) / HOP);
  const edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.round((300 * Math.pow(3000 / 300, i / BANDS)) * N / SR));
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const re = new Float64Array(N), im = new Float64Array(N);
  const bits = new Uint32Array(frames);
  const loud = new Uint8Array(frames);
  let prev = new Float64Array(BANDS);
  for (let f = 0; f < frames; f++) {
    let rms = 0;
    for (let i = 0; i < N; i++) {
      const v = pcm[f * HOP + i] / 32768;
      rms += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms = Math.sqrt(rms / N);
    fft(re, im);
    const e = new Float64Array(BANDS);
    for (let b = 0; b < BANDS; b++) {
      let s = 0;
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) s += re[k] * re[k] + im[k] * im[k];
      e[b] = s;
    }
    let word = 0;
    for (let b = 0; b < BANDS - 1; b++) {
      if (e[b] - e[b + 1] - (prev[b] - prev[b + 1]) > 0) word |= (1 << b) >>> 0;
    }
    bits[f] = word >>> 0;
    loud[f] = rms > 0.004 ? 1 : 0; // les silences ne doivent pas « correspondre »
    prev = e;
  }
  return { bits, loud };
}

function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Plus long passage audio commun entre deux empreintes → plages en secondes, ou null */
function compare(A, B) {
  const nA = A.bits.length, nB = B.bits.length;
  const limit = Math.floor(420 / STEP); // le générique commence dans les 7 premières minutes
  let best = null;
  for (let shift = -(nB - 1); shift < nA; shift++) {
    const i0 = Math.max(0, shift), i1 = Math.min(nA, nB + shift);
    if (i1 - i0 < MIN_INTRO / STEP) continue;
    let runStart = -1, last = -1, gap = 0;
    for (let i = i0; i < i1; i++) {
      const j = i - shift;
      const ok = A.loud[i] && B.loud[j] && popcount((A.bits[i] ^ B.bits[j]) >>> 0) <= MAX_ERR;
      if (ok) {
        if (runStart < 0) runStart = i;
        last = i;
        gap = 0;
      } else if (runStart >= 0 && ++gap > MAX_GAP) {
        best = keep(best, runStart, last, shift, limit);
        runStart = -1; gap = 0;
      }
    }
    if (runStart >= 0) best = keep(best, runStart, last, shift, limit);
  }
  if (!best) return null;
  const toSec = (f) => Math.round(f * STEP * 10) / 10;
  return {
    a: { start: toSec(best.s), end: toSec(best.e + 1) },
    b: { start: toSec(best.s - best.shift), end: toSec(best.e + 1 - best.shift) },
  };
}

function keep(best, s, e, shift, limit) {
  const len = (e - s + 1) * STEP;
  if (len < MIN_INTRO || len > MAX_INTRO) return best;
  if (s > limit || s - shift > limit) return best;
  return !best || len > (best.e - best.s + 1) * STEP ? { s, e, shift } : best;
}


parentPort.on('message', ({ id, op, pcm, A, B }) => {
  try {
    if (op === 'fingerprint') {
      const fp = fingerprint(new Int16Array(pcm));
      parentPort.postMessage({ id, result: fp }, [fp.bits.buffer, fp.loud.buffer]);
    } else if (op === 'compare') {
      parentPort.postMessage({ id, result: compare(A, B) });
    }
  } catch (e) {
    parentPort.postMessage({ id, error: String(e && e.message || e) });
  }
});
