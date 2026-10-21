// Nox parle : sa réponse est lue à voix haute, avec une voix naturelle Gemini si elle est
// choisie (et disponible), sinon avec la voix française de Windows (gratuite, hors ligne).
import { create } from 'zustand';
import { noxKeys } from './noxKeys';
import { useStore } from './store';

/** Voix naturelles Gemini proposées (nom de l'API → description) */
export const GEMINI_VOICES: [string, string][] = [
  ['Puck', 'Enjouée'],
  ['Leda', 'Jeune'],
  ['Sulafat', 'Chaleureuse'],
  ['Achird', 'Amicale'],
  ['Kore', 'Posée'],
  ['Charon', 'Grave'],
];

export const useSpeaking = create<{ speaking: boolean }>(() => ({ speaking: false }));

let queue: string[] = [];
let playing: HTMLAudioElement | null = null;
let run = 0;

/** Texte lisible à voix haute : sans mise en forme, émojis ni symboles */
function clean(text: string) {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/\bVF\b/g, 'V F').replace(/\bVO\b/g, 'V O').replace(/\bVFQ\b/g, 'V F Q')
    .replace(/\s+\n/g, '\n')
    .trim();
}

/** Voix française de Windows (la plus naturelle disponible) */
export function frenchVoices() {
  const all = typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
  const fr = all.filter((v) => /^fr/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) => (/natural|neural|online/i.test(v.name) ? 0 : /fr-FR/i.test(v.lang) ? 1 : 2);
  return fr.sort((a, b) => rank(a) - rank(b));
}

function windowsSay(text: string, me: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve();
    const voices = frenchVoices();
    const wanted = useStore.getState().settings.noxVoiceName;
    const u = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === wanted) || voices[0];
    try { if (voice) u.voice = voice; } catch {}
    u.lang = voice?.lang || 'fr-FR';
    u.rate = 1.05;
    u.pitch = 1.1;
    // Filet de sécurité : si Windows ne signale jamais la fin, Nox ne reste pas « en train de parler »
    const guard = setTimeout(() => { speechSynthesis.cancel(); resolve(); }, 4000 + text.length * 90);
    u.onend = () => { clearTimeout(guard); resolve(); };
    u.onerror = () => { clearTimeout(guard); resolve(); };
    if (me !== run) return resolve();
    try { speechSynthesis.speak(u); } catch { resolve(); }
  });
}

/** PCM 16 bits mono → WAV jouable */
function wavUrl(b64: string, rate: number) {
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = new ArrayBuffer(44 + pcm.length);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

async function geminiSay(text: string, me: number): Promise<boolean> {
  const st = useStore.getState().settings;
  const keys = noxKeys(st).filter((k) => k.provider === 'gemini');
  if (!keys.length || !window.nocta?.assistant.tts) return false;
  const voice = GEMINI_VOICES.some(([n]) => n === st.noxVoiceName) ? st.noxVoiceName : 'Puck';
  const r = await window.nocta.assistant.tts({ keys, text, voice });
  if (me !== run) return true;
  if (!r.ok || !r.audio) return false;
  const url = wavUrl(r.audio, r.rate || 24000);
  await new Promise<void>((resolve) => {
    const a = new Audio(url);
    playing = a;
    a.volume = Math.min(1, useStore.getState().settings.volume ?? 1);
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
  URL.revokeObjectURL(url);
  playing = null;
  return true;
}

async function pump(me: number) {
  useSpeaking.setState({ speaking: true });
  while (queue.length && me === run) {
    const text = queue.shift()!;
    const engine = useStore.getState().settings.noxVoiceEngine || 'windows';
    const done = engine === 'gemini' ? await geminiSay(text, me).catch(() => false) : false;
    if (!done && me === run) await windowsSay(text, me);
  }
  if (me === run) useSpeaking.setState({ speaking: false });
}

/** Lit un texte (à la suite de ce qui est déjà en cours de lecture) */
export function speak(text: string) {
  const t = clean(text);
  if (!t) return;
  queue.push(t);
  if (!useSpeaking.getState().speaking) pump(run);
}

/** Coupe la parole tout de suite */
export function stopSpeaking() {
  run++;
  queue = [];
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  if (playing) { playing.pause(); playing = null; }
  useSpeaking.setState({ speaking: false });
}

/** Petit essai depuis les paramètres */
export function previewVoice() {
  stopSpeaking();
  speak('Salut, moi c\'est Nox ! Je te trouve un bon film en VF pour ce soir ?');
}
