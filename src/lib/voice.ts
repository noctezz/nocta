// Parler à Nox : enregistrement du micro avec détection automatique de la parole.
// L'enregistrement s'arrête tout seul après un court silence, puis l'audio (WAV 16 kHz mono)
// est transcrit par Gemini avec la même clé que Nox.

const RATE = 16000;
const SILENCE_MS = 1200; // silence après la phrase avant de couper
const NO_SPEECH_MS = 7000; // personne ne parle : on abandonne
const MAX_MS = 30000;
const PRE_ROLL_MS = 300; // gardé avant le début de la parole pour ne pas couper le premier mot

export interface Listening {
  /** Arrête tout de suite et garde ce qui a été dit */
  stop: () => void;
  /** Annule sans rien envoyer */
  cancel: () => void;
  /** Résultat : l'audio en base64, ou null (annulé / rien entendu) */
  done: Promise<{ audio: string; mime: string } | null>;
}

/**
 * Écoute le micro. onLevel reçoit le volume (0 à 1) pour l'animation, onSpeech signale que la
 * parole a été détectée.
 */
export async function listen(onLevel: (v: number) => void, onSpeech: () => void): Promise<Listening> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(2048, 1, 1);
  const chunks: Float32Array[] = [];
  const started = performance.now();
  let noise = 0.004; // bruit de fond estimé au fil de l'écoute
  let speechAt = -1; // index du bloc où la parole commence
  let loudMs = 0;
  let quietMs = 0;
  let finished = false;
  let resolve!: (v: { audio: string; mime: string } | null) => void;
  const done = new Promise<{ audio: string; mime: string } | null>((r) => { resolve = r; });

  const finish = (keep: boolean) => {
    if (finished) return;
    finished = true;
    node.disconnect();
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    ctx.close().catch(() => {});
    onLevel(0);
    if (!keep || speechAt < 0) return resolve(null);
    const blockMs = (2048 / rate) * 1000;
    const from = Math.max(0, speechAt - Math.ceil(PRE_ROLL_MS / blockMs));
    resolve({ audio: toBase64(wav(downsample(chunks.slice(from), rate))), mime: 'audio/wav' });
  };

  node.onaudioprocess = (e) => {
    if (finished) return;
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    chunks.push(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const ms = (data.length / ctx.sampleRate) * 1000;
    onLevel(Math.min(1, rms * 14));
    const threshold = Math.max(0.012, noise * 3.2);
    const loud = rms > threshold;
    if (!loud) noise = noise * 0.95 + rms * 0.05;
    if (speechAt < 0) {
      loudMs = loud ? loudMs + ms : 0;
      // Parole confirmée après ~150 ms au-dessus du bruit de fond
      if (loudMs >= 150) {
        speechAt = Math.max(0, chunks.length - 1 - Math.ceil(loudMs / ms));
        onSpeech();
      }
    } else {
      quietMs = loud ? 0 : quietMs + ms;
      if (quietMs >= SILENCE_MS) return finish(true);
    }
    const elapsed = performance.now() - started;
    if (speechAt < 0 && elapsed > NO_SPEECH_MS) return finish(false);
    if (elapsed > MAX_MS) finish(true);
  };
  src.connect(node);
  node.connect(ctx.destination);
  return { stop: () => finish(true), cancel: () => finish(false), done };
}

/** Mélange les blocs et ramène l'audio à 16 kHz */
function downsample(chunks: Float32Array[], rate: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  if (rate === RATE) return all;
  const ratio = rate / RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    // Moyenne des échantillons couverts : filtre simple contre le repliement
    const a = Math.floor(i * ratio), b = Math.min(total, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += all[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

function wav(samples: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------- Écoute continue (mode Jarvis) ----------
export interface Gate {
  /** Micro coupé pour l'instant (Nox parle, bouton micro manuel…) */
  suspended: boolean;
  /** Exigence : 'room' (menus, pièce calme) ou 'loud' (film en cours : il faut parler plus fort que le film) */
  level: 'room' | 'loud';
}

/**
 * Écoute le micro en permanence et découpe les phrases prononcées. Chaque phrase (WAV 16 kHz
 * en base64) est confiée à onSegment. Le seuil s'adapte au bruit ambiant (et au son du film).
 */
export async function createListener(opts: {
  onSegment: (audio: { audio: string; mime: string; ms: number }) => void;
  onLevel?: (v: number) => void;
  onSpeechStart?: () => void;
  gate: () => Gate;
}): Promise<{ stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(2048, 1, 1);
  const rate = ctx.sampleRate;
  const blockMs = (2048 / rate) * 1000;
  const preBlocks = Math.ceil(PRE_ROLL_MS / blockMs);
  let ring: Float32Array[] = [];
  let seg: Float32Array[] | null = null;
  let noise = 0.006;
  let loudMs = 0, quietMs = 0, speechMs = 0, segMs = 0;
  let stopped = false;

  const flush = () => {
    const s = seg;
    seg = null;
    if (!s || speechMs < 350) return;
    opts.onSegment({ audio: toBase64(wav(downsample(s, rate))), mime: 'audio/wav', ms: segMs });
  };

  node.onaudioprocess = (e) => {
    if (stopped) return;
    const g = opts.gate();
    const data = new Float32Array(e.inputBuffer.getChannelData(0));
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    opts.onLevel?.(Math.min(1, rms * 14));
    if (g.suspended) { seg = null; ring = []; loudMs = 0; return; }
    const loudGate = g.level === 'loud';
    const threshold = Math.max(loudGate ? 0.03 : 0.014, noise * (loudGate ? 4.2 : 3));
    const loud = rms > threshold;
    // Bruit de fond (et son du film) suivi en continu, plus lentement pendant qu'on parle
    noise = noise * (seg ? 0.995 : 0.97) + rms * (seg ? 0.005 : 0.03);
    if (!seg) {
      ring.push(data);
      if (ring.length > preBlocks + 6) ring.shift();
      loudMs = loud ? loudMs + blockMs : 0;
      if (loudMs >= 160) {
        seg = [...ring];
        ring = [];
        speechMs = loudMs; quietMs = 0; segMs = seg.length * blockMs;
        opts.onSpeechStart?.();
      }
      return;
    }
    seg.push(data);
    segMs += blockMs;
    if (loud) { speechMs += blockMs; quietMs = 0; } else quietMs += blockMs;
    // Fin de phrase : court silence ; phrases trop longues coupées (le son du film peut ne jamais s'arrêter)
    if (quietMs >= 750 || segMs >= (loudGate ? 9000 : 14000)) { flush(); loudMs = 0; }
  };
  src.connect(node);
  node.connect(ctx.destination);
  return {
    stop: () => {
      stopped = true;
      node.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
