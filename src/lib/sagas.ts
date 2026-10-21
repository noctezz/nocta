// Sagas : chaque film de la liste est retrouvé dans Cinemeta (titre + année), une seule fois,
// puis gardé en mémoire sur le PC pour les visites suivantes.
import { create } from 'zustand';
import { getCatalog, mainAddons, searchableCatalogs } from './addons';
import { useStore } from './store';
import type { MetaPreview, Profile } from './types';
import { SAGAS, type SagaDef } from './sagaList';

export { SAGAS, SAGA_CATS, type SagaDef, type SagaCat } from './sagaList';

const KEY = 'nocta-sagas-v1';
const MISS_RETRY = 24 * 3600_000; // un film introuvable est recherché de nouveau le lendemain

export const filmKey = (f: [string, number]) => `${f[0]}@${f[1]}`;
/** Titre affiché tant que le film n'est pas trouvé */
export const filmLabel = (f: [string, number]) => f[0].split('|')[0];

type Hit = MetaPreview | { miss: number };

function load(): Record<string, Hit> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export const useSagaFilms = create<{ hits: Record<string, Hit> }>(() => ({ hits: load() }));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function remember(key: string, hit: Hit) {
  useSagaFilms.setState((s) => ({ hits: { ...s.hits, [key]: hit } }));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(useSagaFilms.getState().hits)); } catch {}
  }, 800);
}

export function filmOf(hits: Record<string, Hit>, f: [string, number]): MetaPreview | null | undefined {
  const h = hits[filmKey(f)];
  if (!h) return undefined;
  return 'miss' in h ? null : h;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Le bon film parmi les résultats : même année (à un an près), titre le plus proche */
function pick(results: MetaPreview[], query: string, year: number): MetaPreview | null {
  const q = norm(query).split(' ').filter(Boolean);
  let best: MetaPreview | null = null;
  let bestScore = -Infinity;
  results.forEach((m, i) => {
    const y = parseInt(String(m.releaseInfo || ''), 10);
    if (!y || Math.abs(y - year) > 1) return;
    const name = norm(m.name).split(' ').filter(Boolean);
    const set = new Set(name);
    const overlap = q.filter((t) => set.has(t)).length / Math.max(1, q.length);
    // Titre trop différent : seulement s'il est le tout premier résultat de la bonne année exacte
    if (overlap < 0.5 && !(i === 0 && y === year)) return;
    const extra = name.filter((t) => !q.includes(t)).length;
    const score = overlap * 10 - extra * 0.4 + (y === year ? 3 : 0) - i * 0.05 + (norm(m.name) === q.join(' ') ? 4 : 0);
    if (score > bestScore) { bestScore = score; best = m; }
  });
  return best;
}

const slim = (m: MetaPreview): MetaPreview => ({
  id: m.id, type: 'movie', name: m.name, poster: m.poster, background: m.background, logo: m.logo,
  releaseInfo: m.releaseInfo, imdbRating: m.imdbRating, genres: m.genres,
  description: m.description ? m.description.slice(0, 420) : undefined, runtime: m.runtime,
});

// Pas plus de 6 recherches en même temps
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 6) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

const inflight = new Map<string, Promise<void>>();

function resolveFilm(f: [string, number]): Promise<void> {
  const key = filmKey(f);
  const known = useSagaFilms.getState().hits[key];
  if (known && (!('miss' in known) || Date.now() - known.miss < MISS_RETRY)) return Promise.resolve();
  if (inflight.has(key)) return inflight.get(key)!;
  const job = slot(async () => {
    const addons = useStore.getState().addons;
    const cine = mainAddons(addons)[0];
    const cats = cine
      ? [{ addon: cine, id: (cine.manifest.catalogs || []).find((c) => c.type === 'movie' && (c.extra || []).some((e) => e.name === 'search'))?.id || 'top' }]
      : searchableCatalogs(addons).filter((c) => c.catalog.type === 'movie').map((c) => ({ addon: c.addon, id: c.catalog.id }));
    let failed = false;
    for (const q of f[0].split('|')) {
      for (const c of cats) {
        try {
          const found = pick(await getCatalog(c.addon, 'movie', c.id, { search: q }), q, f[1]);
          if (found) return remember(key, slim(found));
        } catch { failed = true; }
      }
    }
    // Erreur réseau : on réessaiera à la prochaine visite, sans marquer le film introuvable
    if (!failed) remember(key, { miss: Date.now() });
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Retrouve les films d'une saga (tous, ou seulement l'image de couverture) */
export function ensureSaga(s: SagaDef, all = true) {
  const films = all ? s.films : [s.films[s.hero ?? 0]];
  return Promise.all(films.map(resolveFilm));
}

export function coverOf(hits: Record<string, Hit>, s: SagaDef) {
  return filmOf(hits, s.films[s.hero ?? 0]) || s.films.map((f) => filmOf(hits, f)).find(Boolean) || null;
}

/** Ordre des films : sortie, ou chronologie de l'histoire */
export function orderOf(s: SagaDef, chrono: boolean) {
  const idx = chrono && s.chrono ? s.chrono : s.films.map((_, i) => i);
  return idx.map((i) => s.films[i]);
}

export const yearsOf = (s: SagaDef) => {
  const ys = s.films.map((f) => f[1]);
  const a = Math.min(...ys), b = Math.max(...ys);
  return a === b ? String(a) : `${a} – ${b}`;
};

/** Le film est-il vu (coché, ou regardé presque jusqu'au bout) ? */
export function isSeen(p: Profile | null, id: string) {
  if (!p) return false;
  if (p.watched?.[id]) return true;
  const e = p.progress[id];
  return !!e && e.duration > 0 && e.position / e.duration > 0.92;
}

export function sagaProgress(p: Profile | null, hits: Record<string, Hit>, s: SagaDef) {
  let seen = 0;
  for (const f of s.films) {
    const m = filmOf(hits, f);
    if (m && isSeen(p, m.id)) seen++;
  }
  return { seen, total: s.films.length };
}

/** Le prochain film à regarder dans l'ordre choisi */
export function nextOf(p: Profile | null, hits: Record<string, Hit>, s: SagaDef, chrono: boolean): MetaPreview | null {
  for (const f of orderOf(s, chrono)) {
    const m = filmOf(hits, f);
    if (m && !isSeen(p, m.id)) return m;
  }
  return null;
}

export const sagaById = (id: string) => SAGAS.find((s) => s.id === id) || null;
