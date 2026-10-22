// Vérification de la VRAIE langue d'une source : NOCTA lit l'en-tête du fichier
// (pistes audio et sous-titres) au lieu de croire le nom du torrent (« VF », « MULTI »…).
// Les résultats sont mémorisés : une source déjà vérifiée l'est instantanément ensuite.
import type { Stream } from './types';
import { cleanup as torboxCleanup, snapshot as torboxSnapshot } from './torbox';
import { useStore } from './store';
import { IS_TV } from './tv';

export type LangStatus = 'fr' | 'nofr' | 'unknown';
export interface LangInfo {
  status: LangStatus;
  /** Texte court pour l'interface : « VF vérifiée », « Audio anglais »… */
  label: string;
  /** Uniquement du français québécois */
  vfq?: boolean;
  /** Sous-titres français présents */
  frSubs?: boolean;
  /** Une piste audio non française (la VO) est présente ; undefined = on ne sait pas */
  vo?: boolean;
  /** Langue(s) de la VO, en toutes lettres */
  voLabel?: string;
  at: number;
}

const KEY = 'nocta-langs';
const MAX = 500;
const TTL = 30 * 24 * 3600 * 1000;

const LANG_FR: Record<string, string> = {
  en: 'anglais', eng: 'anglais', es: 'espagnol', spa: 'espagnol', de: 'allemand', ger: 'allemand', deu: 'allemand',
  it: 'italien', ita: 'italien', ja: 'japonais', jpn: 'japonais', ko: 'coréen', kor: 'coréen', pt: 'portugais',
  por: 'portugais', ru: 'russe', rus: 'russe', zh: 'chinois', chi: 'chinois', zho: 'chinois', hi: 'hindi', hin: 'hindi',
  ar: 'arabe', ara: 'arabe', nl: 'néerlandais', dut: 'néerlandais', nld: 'néerlandais', pl: 'polonais', pol: 'polonais',
  tr: 'turc', tur: 'turc', sv: 'suédois', swe: 'suédois',
};

const FR_CODE = /^(fr|fre|fra|french|fr-[a-z]{2})$/i;
const FR_TITLE = /\b(vff|vfq|vfi|vf2|vf|truefrench|french|fran[cç]ais|francais)\b/i;
const QC = /\b(vfq|qu[ée]b[ée]c|qu[ée]becois|canad)|^fr-ca$/i;
const UNDEFINED = /^(und|unk|mis|zxx|)$/i;

type Track = { lang: string; title: string; forced: boolean };

/** Classe une source d'après ses pistes réelles */
export function classify(audios: Track[], subs: Track[]): Omit<LangInfo, 'at'> {
  // Le titre de piste ne compte que si la langue n'est pas renseignée (certains titres
  // reprennent le nom du torrent, « FRENCH » compris, sur une piste anglaise)
  const isFr = (t: Track) => FR_CODE.test(t.lang) || (UNDEFINED.test(t.lang.trim()) && FR_TITLE.test(t.title));
  const frSubs = subs.some((t) => !t.forced && isFr(t));
  const fr = audios.filter(isFr);
  const others = audios.filter((t) => !isFr(t) && !UNDEFINED.test(t.lang.trim()));
  const names = [...new Set(others.map((t) => LANG_FR[t.lang.toLowerCase()] || t.lang.toUpperCase()))].slice(0, 2);
  if (fr.length) {
    const vfq = fr.every((t) => QC.test(t.lang) || QC.test(t.title));
    return { status: 'fr', label: vfq ? 'VFQ vérifiée' : 'VF vérifiée', vfq, frSubs, vo: others.length > 0, voLabel: names.join(', ') };
  }
  if (!audios.length || !others.length) return { status: 'unknown', label: 'Langue non indiquée', frSubs };
  return { status: 'nofr', label: `Pas de VF · ${names.join(', ')}`, frSubs, vo: true, voLabel: names.join(', ') };
}

// ---------- Cache ----------
let cache: Record<string, LangInfo> = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
})();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const entries = Object.entries(cache).filter(([, v]) => Date.now() - v.at < TTL).sort((a, b) => b[1].at - a[1].at).slice(0, MAX);
    cache = Object.fromEntries(entries);
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  }, 500);
}

const keyOf = (s: Stream) => s.url || '';

export function cachedLang(s: Stream): LangInfo | undefined {
  const v = cache[keyOf(s)];
  return v && Date.now() - v.at < TTL ? v : undefined;
}

/**
 * Seuls les liens directs déjà prêts sont vérifiés : ouvrir un lien débrid « non en cache »
 * lancerait son téléchargement sur le compte débrideur.
 */
export const canCheck = (s: Stream) =>
  !!s.url && /^https?:/i.test(s.url) && !!window.nocta?.media.langs && /⚡|\+\]|cached|instant/i.test(`${s.name} ${s.title}`);

// ---------- Vérifications (3 en parallèle au plus ; une seule sur la TV) ----------
const inflight = new Map<string, Promise<LangInfo | null>>();
/** Liste TorBox prise juste avant chaque vérification : permet de retirer plus tard ce qu'elle a ajouté */
const befores = new Map<string, Set<number>>();
let running = 0;
const queue: (() => void)[] = [];
const listeners = new Set<() => void>();

function slot<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      fn().then(resolve, reject).finally(() => { running--; queue.shift()?.(); });
    };
    if (running < (IS_TV ? 1 : 3)) run(); else queue.push(run);
  });
}

/** Vérifie une source (ou renvoie le résultat déjà connu). null = vérification impossible */
export function checkLang(s: Stream): Promise<LangInfo | null> {
  const known = cachedLang(s);
  if (known) return Promise.resolve(known);
  if (!canCheck(s)) return Promise.resolve(null);
  const key = keyOf(s);
  const cur = inflight.get(key);
  if (cur) return cur;
  const p = slot(async () => {
    // Sur la TV, pas de vérification pendant la lecture : toute la box est pour la vidéo
    if (IS_TV && useStore.getState().player) return null;
    // Liste TorBox juste avant d'ouvrir la source : seul ce qui apparaît ensuite pourra être retiré
    const before = await torboxSnapshot();
    if (before) befores.set(key, before);
    const r = await window.nocta!.media.langs(s.url!);
    if (!r.ok) return null;
    const info: LangInfo = { ...classify(r.audios || [], r.subs || []), at: Date.now() };
    cache[key] = info;
    persist();
    listeners.forEach((f) => f());
    return info;
  }).catch(() => null).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const isChecking = (s: Stream) => inflight.has(keyOf(s));

/**
 * Source ouverte pour vérification mais finalement pas retenue : retirée de TorBox
 * (seulement si c'est la vérification qui l'y avait ajoutée).
 */
export function discard(s: Stream) {
  const key = keyOf(s);
  const before = befores.get(key);
  if (!before) return;
  befores.delete(key);
  discarded.add(key);
  torboxCleanup(s, before).catch(() => {});
}

/**
 * Sources retirées de TorBox pendant cette session : l'addon peut encore garder en mémoire
 * l'ancien lien (devenu invalide), donc on évite de les relancer.
 */
const discarded = new Set<string>();
export const wasDiscarded = (s: Stream) => discarded.has(keyOf(s));

/** Prévient quand un résultat arrive (pour rafraîchir la liste des sources) */
export function onLangResult(f: () => void) {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Bonus de classement : la langue vérifiée dans le fichier passe devant le nom du torrent */
export function langBonus(s: Stream, mode: 'vf' | 'vo' | null = 'vf'): number {
  const v = cachedLang(s);
  if (!v || !mode) return 0;
  if (mode === 'vo') return v.vo === true ? 60_000 : v.status === 'fr' && v.vo === false ? -60_000 : 0;
  // VFF avant VFQ (français québécois) à qualité égale
  return v.status === 'fr' ? (v.vfq ? 55_000 : 60_000) : v.status === 'nofr' ? -60_000 : 0;
}

/** La source vérifiée convient-elle à la langue voulue ? (true / false / null = on ne sait pas) */
export function fitsVerified(info: LangInfo | null | undefined, mode: 'vf' | 'vo'): boolean | null {
  if (!info) return null;
  if (mode === 'vf') return info.status === 'fr' ? true : info.status === 'nofr' ? false : null;
  return info.vo === true ? true : info.status === 'fr' && info.vo === false ? false : null;
}
