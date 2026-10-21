// Mode Jarvis : Nox écoute en permanence. « Nox, lance-moi Spider-Man » depuis les menus,
// « Nox, c'est qui ce mec ? » pendant un film (pause, réponse à voix haute, puis reprise).
// Le mot magique « Nox » évite que le son du film ou une conversation déclenche quoi que ce soit.
import { create } from 'zustand';
import { noxKeys } from './noxKeys';
import { useNox } from './nox';
import { nowTime } from './playerClock';
import { speak, stopSpeaking, useSpeaking } from './speak';
import { useStore } from './store';
import { createListener, type Gate } from './voice';
import { sceneDialogue } from './xray';

type Status = 'off' | 'idle' | 'speech' | 'heard' | 'thinking' | 'error';

interface JarvisState {
  status: Status;
  level: number;
  /** Dernière phrase comprise (affichée un instant) */
  heard: string;
  error: string;
}
export const useJarvis = create<JarvisState>(() => ({ status: 'off', level: 0, heard: '', error: '' }));

/** « Nox », « OK Nox », « Dis Nox »… (et les variantes que la transcription produit parfois) */
const WAKE = /^\W*(?:(?:ok|okay|hey|hé|eh|dis|allez|bon)\s+)?(?:nox|knox|noxe|nocs|noks|nocks|knocks|nok|noxx)\b[\s,.!?:;-]*/i;

let listener: { stop: () => void } | null = null;
let starting = false;
let followUntil = 0; // juste après « Nox ? » : la phrase suivante n'a pas besoin du mot magique
let busy = 0; // transcriptions en cours
let manualMic = false;
let pausedByJarvis = false;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;
let speakingUntil = 0;

/** Le bouton micro du chat est utilisé : Jarvis se met en retrait */
export const setManualMic = (v: boolean) => { manualMic = v; };

const settings = () => useStore.getState().settings;
const voiceKeys = () => noxKeys(settings()).filter((k) => k.provider === 'groq' || k.provider === 'gemini');
const inPlayer = () => !!useStore.getState().player;
const player = () => window.nocta!.player;

/** Bulle Nox affichée par-dessus le film */
function bubble(b: { state: 'listening' | 'thinking' | 'answer' | 'done' | 'action'; heard?: string; text?: string; resumeIn?: number } | null) {
  if (inPlayer()) player().info({ jarvis: b ? { ...b, at: Date.now() } : null });
}

// Nox parle : le micro l'entendrait, on suspend l'écoute (et un peu après)
useSpeaking.subscribe((s) => { if (!s.speaking) speakingUntil = Date.now() + 700; });

function gate(): Gate {
  return {
    suspended: manualMic || useSpeaking.getState().speaking || Date.now() < speakingUntil || busy > 1,
    level: inPlayer() && !pausedByJarvis ? 'loud' : 'room',
  };
}

// ---------- Commandes directes du lecteur (sans passer par l'IA : instantané) ----------
const NUM: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40 };
const toNum = (s: string) => (/^\d+$/.test(s) ? +s : NUM[s.toLowerCase()] ?? 0);

function playerCommand(c: string): { run: () => void; label: string; stay?: boolean } | null {
  const t = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!?]/g, '').trim();
  const cmd = (...a: unknown[]) => player().cmd(...a);
  let m: RegExpExecArray | null;
  if (/^(mets? (en )?pause|pause|stop|arrete|attends?)$/.test(t)) return { run: () => cmd('set_property', 'pause', true), label: '⏸ Pause', stay: true };
  if (/^(reprends?|relance|continue|play|lecture|vas-?y|c'?est bon|on reprend)( la (lecture|video))?$/.test(t)) return { run: () => cmd('set_property', 'pause', false), label: '▶ C\'est reparti' };
  if ((m = /(avance|recule|reviens?|retourne)\s+(?:de\s+)?(\d+|une?|deux|trois|quatre|cinq|six|dix|quinze|vingt|trente|quarante)\s*(secondes?|sec|s|minutes?|min)/.exec(t))) {
    const n = toNum(m[2]) * (/^min/.test(m[3]) ? 60 : 1) * (m[1] === 'avance' ? 1 : -1);
    return { run: () => cmd('seek', n, 'relative'), label: `${n > 0 ? '⏩' : '⏪'} ${Math.abs(n) >= 60 ? `${Math.abs(n) / 60} min` : `${Math.abs(n)} s`}` };
  }
  if (/(monte|augmente|plus fort|mets plus de son)/.test(t) && /(son|volume|fort)/.test(t)) return { run: () => cmd('add', 'volume', 15), label: '🔊 Plus fort' };
  if (/(baisse|diminue|moins fort)/.test(t) && /(son|volume|fort)/.test(t)) return { run: () => cmd('add', 'volume', -15), label: '🔉 Moins fort' };
  if (/^(coupe le son|mute|silence)$/.test(t)) return { run: () => cmd('set_property', 'mute', true), label: '🔇 Son coupé' };
  if (/(remets|reactive) le son/.test(t)) return { run: () => cmd('set_property', 'mute', false), label: '🔊 Son remis' };
  if (/(episode suivant|prochain episode|passe a la suite|suivant)$/.test(t)) return { run: () => player().next(), label: '⏭ Épisode suivant' };
  if (/(active|mets|affiche).*(sous-?titres?)/.test(t)) return { run: () => cmd('set_property', 'sub-visibility', true), label: '💬 Sous-titres affichés' };
  if (/(enleve|desactive|coupe|cache|retire).*(sous-?titres?)/.test(t)) return { run: () => cmd('set_property', 'sub-visibility', false), label: '💬 Sous-titres masqués' };
  if (/(quitte|ferme|arrete) (le )?(lecteur|film|la video|la serie|l'episode)/.test(t)) return { run: () => player().close(), label: '⏹ Lecture arrêtée', stay: true };
  if (/(recommence|reprends?) (au|du) debut/.test(t)) return { run: () => cmd('seek', 0, 'absolute'), label: '⏮ Depuis le début' };
  return null;
}

function scheduleResume(delay = 2500) {
  clearTimeout(resumeTimer);
  if (!pausedByJarvis || !inPlayer()) return;
  bubble({ state: 'done', resumeIn: Math.round(delay / 1000) });
  resumeTimer = setTimeout(() => {
    if (!pausedByJarvis || !inPlayer()) return;
    pausedByJarvis = false;
    player().cmd('set_property', 'pause', false);
    bubble(null);
  }, delay);
}

/** Nox a fini de parler : on attend la fin de sa réponse avant de relancer le film */
function afterSpeech(cb: () => void) {
  const check = () => (useSpeaking.getState().speaking ? setTimeout(check, 300) : cb());
  setTimeout(check, 400);
}

async function handle(text: string) {
  const wake = WAKE.exec(text);
  const following = Date.now() < followUntil;
  const anyPhrase = settings().jarvisWake === 'all' && !inPlayer();
  if (!wake && !following && !anyPhrase) return;
  const command = (wake ? text.slice(wake[0].length) : text).replace(/^[\s,.!?:;-]+|[\s,]+$/g, '').trim();
  followUntil = 0;
  stopSpeaking();
  clearTimeout(resumeTimer);
  useJarvis.setState({ heard: command || 'Nox ?', status: 'heard' });

  if (inPlayer()) {
    // Pendant le film : pause tout de suite
    player().cmd('set_property', 'pause', true);
    pausedByJarvis = true;
  }
  if (!command) {
    followUntil = Date.now() + 8000;
    bubble({ state: 'listening' });
    speak('Oui ?');
    setTimeout(() => { if (followUntil && Date.now() > followUntil) { followUntil = 0; scheduleResume(500); } }, 8600);
    return;
  }

  if (inPlayer()) {
    const direct = playerCommand(command);
    if (direct) {
      direct.run();
      if (direct.stay || /pause|reprend|relance|continue|play|lecture/i.test(direct.label)) pausedByJarvis = false;
      bubble({ state: 'action', heard: command, text: direct.label });
      setTimeout(() => bubble(null), 2200);
      // Commande qui ne touche pas à la lecture (son, sous-titres, avance) : le film repart
      if (pausedByJarvis) { pausedByJarvis = false; player().cmd('set_property', 'pause', false); }
      useJarvis.setState({ status: 'idle' });
      return;
    }
    // Question sur le film : Nox répond avec les dialogues des dernières minutes
    bubble({ state: 'thinking', heard: command });
    useJarvis.setState({ status: 'thinking' });
    const st = useStore.getState();
    const p = st.player!;
    const t = nowTime(true);
    const lines = p.type && p.videoId ? await sceneDialogue({ type: p.type, videoId: p.videoId }, t).catch(() => null) : null;
    const mm = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const context = `[Pendant la lecture, à ${mm}. Réponds à la question sur ce que l'utilisateur regarde, sans rien révéler de la suite. Réponse courte (2-3 phrases), elle sera lue à voix haute.${lines ? `\nDialogues des dernières minutes :\n${lines}` : ''}]`;
    const before = useNox.getState().items.length;
    await useNox.getState().ask(command, { byVoice: true, context });
    const answer = useNox.getState().items.slice(before).filter((i) => i.role === 'nox' || i.role === 'error').map((i) => i.text).join('\n');
    bubble({ state: 'answer', heard: command, text: answer || 'Je n\'ai pas de réponse pour le moment.' });
    useJarvis.setState({ status: 'idle' });
    afterSpeech(() => setTimeout(() => scheduleResume(3000), (settings().noxVoice || 'mic') === 'off' ? 5000 : 600));
    return;
  }

  // Dans les menus : la discussion s'ouvre et Nox s'exécute
  useNox.getState().setOpen(true);
  useJarvis.setState({ status: 'thinking' });
  await useNox.getState().ask(command, { byVoice: true });
  useJarvis.setState({ status: 'idle' });
}

const recent: number[] = [];

async function onSegment(seg: { audio: string; mime: string }) {
  const keys = voiceKeys();
  if (!keys.length) return;
  // Pendant un film, le son du film découpe beaucoup de « phrases » : on en transcrit au plus
  // 12 par minute (quota gratuit), sauf juste après « Nox ? »
  const now = Date.now();
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (inPlayer() && !pausedByJarvis && Date.now() > followUntil && recent.length >= 12) return;
  recent.push(now);
  busy++;
  try {
    const r = await window.nocta!.assistant.transcribe({ keys, ...seg });
    if (r.ok && r.text) await handle(r.text);
    else if (!r.ok && /quota/i.test(r.error || '')) useJarvis.setState({ error: r.error || '' });
  } finally {
    busy--;
    if (useJarvis.getState().status === 'speech') useJarvis.setState({ status: 'idle' });
  }
}

let hooked = false;

export async function startJarvis() {
  if (listener || starting || !voiceKeys().length || !navigator.mediaDevices) return;
  // Depuis le lecteur : « Rester en pause » annule la reprise automatique
  if (!hooked && window.nocta?.player?.on) {
    hooked = true;
    window.nocta.player.on('player:jarvis', (d: { stay?: boolean }) => {
      if (d?.stay) { clearTimeout(resumeTimer); pausedByJarvis = false; bubble(null); }
    });
  }
  starting = true;
  try {
    listener = await createListener({
      gate,
      onSegment,
      onLevel: (v) => { if (Math.abs(v - useJarvis.getState().level) > 0.04) useJarvis.setState({ level: v }); },
      onSpeechStart: () => { if (useJarvis.getState().status === 'idle') useJarvis.setState({ status: 'speech' }); },
    });
    useJarvis.setState({ status: 'idle', error: '' });
  } catch (e) {
    useJarvis.setState({ status: 'error', error: (e as DOMException)?.name === 'NotAllowedError' ? 'Micro refusé par Windows' : 'Micro indisponible' });
  } finally {
    starting = false;
  }
}

export function stopJarvis() {
  listener?.stop();
  listener = null;
  useJarvis.setState({ status: 'off', level: 0 });
}

