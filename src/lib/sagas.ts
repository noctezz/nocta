// Sagas : chaque film de la liste est retrouvé dans Cinemeta (titre + année), une seule fois,
// puis gardé en mémoire sur le PC pour les visites suivantes.
import { create } from 'zustand';
import { getCatalog, getMeta, mainAddons, searchableCatalogs } from './addons';
import { useStore } from './store';
import type { MetaPreview, Profile } from './types';
import { SAGAS, type SagaDef } from './sagaList';

export { SAGAS, SAGA_CATS, type SagaDef, type SagaCat } from './sagaList';

const KEY = 'nocta-sagas-v2';
const MISS_RETRY = 6 * 3600_000; // un film introuvable est recherché de nouveau quelques heures plus tard

export const filmKey = (f: [string, number]) => `${f[0]}@${f[1]}`;
/** Titre affiché tant que le film n'est pas trouvé */
export const filmLabel = (f: [string, number]) => f[0].split('|')[0];

/** manual : film choisi à la main, jamais remplacé par une recherche automatique */
type Hit = (MetaPreview & { manual?: boolean }) | { miss: number };

function load(): Record<string, Hit> {
  try {
    const now = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (now) return now;
    // Ancienne version : on garde les films trouvés, et on recherche de nouveau les autres
    const old = JSON.parse(localStorage.getItem('nocta-sagas-v1') || '{}') || {};
    return Object.fromEntries(Object.entries(old).filter(([, h]) => h && !('miss' in (h as object)))) as Record<string, Hit>;
  } catch { return {}; }
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
const SMALL = new Set(['the', 'a', 'an', 'and', 'of', 'le', 'la', 'les', 'de', 'du', 'des', 'et', 'l', 'd']);
const words = (s: string) => norm(s).split(' ').filter((t) => t && !SMALL.has(t));

/**
 * Ressemblance entre le titre cherché et un résultat (0 = rien à voir). Accepte « Star Wars »
 * pour « Star Wars: Episode IV - A New Hope », et l'inverse.
 */
function likeness(query: string, name: string) {
  const q = words(query), n = words(name);
  if (!q.length || !n.length) return norm(query) === norm(name) ? 1 : 0;
  if (q.join(' ') === n.join(' ')) return 1;
  const ns = new Set(n), qs = new Set(q);
  const a = q.filter((t) => ns.has(t)).length / q.length; // le résultat contient la recherche
  const b = n.filter((t) => qs.has(t)).length / n.length; // la recherche contient le résultat
  return Math.max(a * 0.9 + b * 0.1, b * 0.75 + a * 0.25);
}

interface Candidate { id: string; name: string; year?: number; at: number; meta?: MetaPreview; poster?: string }

/** Le bon candidat : même année (à un an près), le titre le plus proche */
function best(cands: Candidate[], queries: string[], year: number): Candidate | null {
  let top: Candidate | null = null;
  let topScore = 0;
  for (const c of cands) {
    if (!c.year || Math.abs(c.year - year) > 1 || !/^tt\d+$/.test(c.id)) continue;
    const like = Math.max(...queries.map((q) => likeness(q, c.name)));
    if (like < 0.5) continue;
    const score = like * 10 + (c.year === year ? 3 : 0) - c.at * 0.04;
    if (score > topScore) { topScore = score; top = c; }
  }
  return top;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Requête JSON, réessayée deux fois si le serveur ne répond pas */
async function json(url: string, headers?: Record<string, string>): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      if (window.nocta) {
        const r = await window.nocta.http(url, { headers, timeout: 15000 });
        if (r.ok) return r.data;
        if (r.status && r.status < 500 && r.status !== 429) return null; // introuvable : inutile d'insister
        throw new Error(r.error || `HTTP ${r.status}`);
      }
      const r = await fetch(url, { headers });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) return null;
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= 2) throw e;
      await sleep(800 * (i + 1) + Math.random() * 400);
    }
  }
}

const yearOf = (v: unknown) => parseInt(String(v || ''), 10) || undefined;

/** Variantes d'un titre : tel quel, sans sous-titre, sans « Episode IV - » */
function variants(raw: string) {
  const out: string[] = [];
  const add = (q: string) => { q = q.trim(); if (q && !out.includes(q)) out.push(q); };
  for (const q of raw.split('|')) add(q);
  for (const q of raw.split('|')) {
    add(q.replace(/\s+-\s+/g, ' ').replace(/:/g, ''));
    add(q.replace(/^.*?:\s*/, '')); // « Star Wars: Episode V - The Empire Strikes Back » → « Episode V - … »
    add(q.replace(/^.*\s-\s/, '')); // → « The Empire Strikes Back »
  }
  return out;
}

// ---- Source 1 : Cinemeta (le catalogue de l'app)
async function fromCinemeta(q: string): Promise<Candidate[]> {
  const addons = useStore.getState().addons;
  const cine = mainAddons(addons)[0];
  const cats = cine
    ? [{ addon: cine, id: (cine.manifest.catalogs || []).find((c) => c.type === 'movie' && (c.extra || []).some((e) => e.name === 'search'))?.id || 'top' }]
    : searchableCatalogs(addons).filter((c) => c.catalog.type === 'movie').map((c) => ({ addon: c.addon, id: c.catalog.id }));
  const out: Candidate[] = [];
  for (const c of cats) {
    let list: MetaPreview[] = [];
    for (let i = 0; ; i++) {
      try { list = await getCatalog(c.addon, 'movie', c.id, { search: q }); break; } catch (e) {
        if (i >= 2) throw e;
        await sleep(800 * (i + 1));
      }
    }
    list.forEach((m, i) => out.push({ id: m.id, name: m.name, year: yearOf(m.releaseInfo), at: i, meta: m }));
  }
  return out;
}

// ---- Source 2 : la recherche d'IMDb (tous les films, avec leur année)
async function fromImdb(q: string): Promise<Candidate[]> {
  const term = norm(q).slice(0, 60);
  if (!term) return [];
  const d = await json(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(term)}.json?includeVideos=0`);
  return ((d && d.d) || [])
    .filter((x: any) => x && /^tt/.test(x.id) && (!x.qid || /movie|tvMovie|video/i.test(x.qid)))
    .map((x: any, i: number) => ({ id: x.id, name: x.l, year: x.y, at: i, poster: x.i?.imageUrl }));
}

// ---- Source 3 : TMDB (si une clé est enregistrée), qui connaît aussi les titres français
async function fromTmdb(q: string, year: number): Promise<Candidate[]> {
  const key = (useStore.getState().settings.tmdbKey || '').trim();
  if (!key) return [];
  const bearer = key.length > 40;
  const call = (path: string, params: Record<string, string>) => {
    const p = new URLSearchParams(params);
    if (!bearer) p.set('api_key', key);
    return json(`https://api.themoviedb.org/3${path}?${p}`, bearer ? { Authorization: `Bearer ${key}` } : undefined);
  };
  const d = await call('/search/movie', { query: q, year: String(year), language: 'fr-FR' });
  const out: Candidate[] = [];
  for (const [i, r] of ((d && d.results) || []).slice(0, 3).entries()) {
    const y = yearOf(r.release_date);
    if (!y || Math.abs(y - year) > 1) continue;
    const ext = await call(`/movie/${r.id}/external_ids`, {}).catch(() => null);
    // Titre original et titre français : l'un des deux doit ressembler à la recherche
    if (ext?.imdb_id) out.push({ id: ext.imdb_id, name: likeness(q, r.title) >= likeness(q, r.original_title || '') ? r.title : r.original_title, year: y, at: i });
  }
  return out;
}

/** Fiche complète du film trouvé (affiche, résumé, note) */
async function toMeta(c: Candidate, year: number): Promise<MetaPreview> {
  if (c.meta && c.meta.poster) return slim(c.meta);
  const full = await getMeta(useStore.getState().addons, 'movie', c.id).catch(() => null);
  // La fiche doit bien être celle de ce film (même identifiant, titre proche)
  if (full && (full.id === c.id || likeness(c.name, full.name) >= 0.5)) {
    return slim({ ...full, id: c.id, type: 'movie', releaseInfo: full.releaseInfo || String(c.year || year) });
  }
  return { id: c.id, type: 'movie', name: c.name, releaseInfo: String(c.year || year), poster: c.poster };
}

const inflight = new Map<string, Promise<void>>();

function resolveFilm(f: [string, number], force = false): Promise<void> {
  const key = filmKey(f);
  const known = useSagaFilms.getState().hits[key];
  if (known && (!('miss' in known) || (!force && Date.now() - known.miss < MISS_RETRY))) return Promise.resolve();
  if (inflight.has(key)) return inflight.get(key)!;
  const job = slot(async () => {
    const [raw, year] = f;
    const queries = variants(raw);
    const titles = raw.split('|').map((t) => t.trim());
    let failed = 0;
    let tried = 0;
    const attempt = async (q: string, fn: () => Promise<Candidate[]>) => {
      tried++;
      try {
        const cands = await fn();
        // Résultat sans année : on la lit dans sa fiche si le titre correspond bien
        for (const c of cands.filter((x) => !x.year && likeness(q, x.name) >= 0.9).slice(0, 3)) {
          const full = await getMeta(useStore.getState().addons, 'movie', c.id).catch(() => null);
          c.year = yearOf(full?.releaseInfo || (full as { year?: string } | null)?.year);
        }
        const c = best(cands, titles.includes(q) ? titles : [q], year);
        if (c) { remember(key, await toMeta(c, year)); return true; }
      } catch { failed++; }
      return false;
    };
    // Titres exacts d'abord, sur chaque source, puis les variantes
    for (const q of titles) if (await attempt(q, () => fromCinemeta(q))) return;
    for (const q of titles) if (await attempt(q, () => fromImdb(q))) return;
    for (const q of titles) if (await attempt(q, () => fromTmdb(q, year))) return;
    for (const q of queries.filter((x) => !titles.includes(x))) {
      if (await attempt(q, () => fromImdb(q))) return;
      if (await attempt(q, () => fromCinemeta(q))) return;
    }
    // Toutes les sources injoignables : on réessaiera, sans déclarer le film introuvable
    if (failed < tried) remember(key, { miss: Date.now() });
  }).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/** Le bon film choisi à la main : retenu pour toujours */
export function setFilm(f: [string, number], m: MetaPreview) {
  remember(filmKey(f), { ...slim(m), manual: true });
}

/** Résultats pour choisir un film à la main (catalogue + IMDb) */
export async function searchFilms(q: string): Promise<MetaPreview[]> {
  const [a, b] = await Promise.all([fromCinemeta(q).catch(() => []), fromImdb(q).catch(() => [])]);
  const seen = new Set<string>();
  const out: MetaPreview[] = [];
  for (const c of [...a, ...b]) {
    if (!/^tt\d+$/.test(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c.meta ? slim(c.meta) : { id: c.id, type: 'movie', name: c.name, releaseInfo: c.year ? String(c.year) : undefined, poster: c.poster });
  }
  return out.slice(0, 24);
}

/** Retrouve les films d'une saga (tous, ou seulement l'image de couverture) */
export function ensureSaga(s: SagaDef, all = true) {
  const films = all ? s.films : [s.films[s.hero ?? 0]];
  // Saga ouverte : les films pas encore trouvés sont recherchés de nouveau tout de suite
  return Promise.all(films.map((f) => resolveFilm(f, all)));
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

/**
 * Le prochain film à regarder dans l'ordre choisi. Un film pas encore trouvé n'est jamais sauté :
 * m vaut undefined (recherche en cours) ou null (à choisir à la main).
 */
export function nextStep(p: Profile | null, hits: Record<string, Hit>, s: SagaDef, chrono: boolean): { f: [string, number]; m: MetaPreview | null | undefined } | null {
  for (const f of orderOf(s, chrono)) {
    const m = filmOf(hits, f);
    if (!m || !isSeen(p, m.id)) return { f, m };
  }
  return null;
}

export function nextOf(p: Profile | null, hits: Record<string, Hit>, s: SagaDef, chrono: boolean): MetaPreview | null {
  return nextStep(p, hits, s, chrono)?.m || null;
}

export const sagaById = (id: string) => SAGAS.find((s) => s.id === id) || null;
