// Journal (façon Letterboxd) : notes en demi-étoiles, coups de cœur, critiques, séances datées
// et 4 films favoris, propres à chaque profil et enregistrés avec lui.
import { create } from 'zustand';
import { useStore } from './store';
import type { Journal, JournalEntry, FilmMark, MetaPreview, PartMark, Profile } from './types';

const EMPTY: Journal = { entries: [], marks: {} };

export const journalOf = (p: Profile | null | undefined): Journal => p?.journal || EMPTY;

/** Fiche allégée gardée dans le journal */
export function slim(m: MetaPreview): MetaPreview {
  return {
    id: m.id, type: m.type, name: m.name, poster: m.poster, background: m.background, logo: m.logo,
    releaseInfo: m.releaseInfo, imdbRating: m.imdbRating, genres: m.genres, runtime: m.runtime,
  };
}

/** Modifie le journal du profil actif */
function change(fn: (j: Journal) => Journal) {
  useStore.setState((s) => ({
    profiles: s.profiles.map((p) => (p.id === s.activeProfileId ? { ...p, journal: fn(journalOf(p)) } : p)),
  }));
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Note et coup de cœur d'un titre, sans séance (étoiles de la fiche) */
export function markFilm(meta: MetaPreview, patch: { rating?: number | null; liked?: boolean }) {
  change((j) => {
    const prev = j.marks[meta.id];
    const next: FilmMark = { meta: slim(meta), rating: prev?.rating, liked: prev?.liked, at: Date.now() };
    if ('rating' in patch) next.rating = patch.rating || undefined;
    if ('liked' in patch) next.liked = patch.liked;
    const marks = { ...j.marks };
    if (!next.rating && !next.liked && !j.entries.some((e) => e.meta.id === meta.id)) delete marks[meta.id];
    else marks[meta.id] = next;
    return { ...j, marks };
  });
}

// ---------- Séries : saisons et épisodes ----------

export const seasonKey = (id: string, season: number) => `${id}:${season}`;
export const episodeKey = (id: string, season: number, episode: number) => `${id}:${season}:${episode}`;

/** À quoi se rapporte une séance : le titre entier, une saison, ou un épisode */
export const levelOf = (e: { season?: number; episode?: number }) => (e.episode != null && e.season != null ? 'episode' : e.season != null ? 'season' : 'title');
const keyOf = (e: { meta: MetaPreview; season?: number; episode?: number }) => {
  const l = levelOf(e);
  return l === 'episode' ? episodeKey(e.meta.id, e.season!, e.episode!) : l === 'season' ? seasonKey(e.meta.id, e.season!) : e.meta.id;
};

/** Note d'une saison ou d'un épisode, sans séance */
export function markPart(meta: MetaPreview, season: number, episode: number | null, patch: { rating?: number | null; liked?: boolean }) {
  change((j) => {
    const field = episode == null ? 'seasons' : 'episodes';
    const key = episode == null ? seasonKey(meta.id, season) : episodeKey(meta.id, season, episode);
    const map = { ...(j[field] || {}) };
    const prev = map[key];
    const next: PartMark = { rating: prev?.rating, liked: prev?.liked, at: Date.now() };
    if ('rating' in patch) next.rating = patch.rating || undefined;
    if ('liked' in patch) next.liked = patch.liked;
    if (!next.rating && !next.liked) delete map[key]; else map[key] = next;
    // La série apparaît dans le journal dès qu'une saison ou un épisode est noté
    const marks = j.marks[meta.id] ? j.marks : { ...j.marks, [meta.id]: { meta: slim(meta), at: Date.now() } };
    return { ...j, [field]: map, marks };
  });
}

/** Ajoute ou modifie une séance ; la note (du titre, de la saison ou de l'épisode) suit la séance la plus récente */
export function saveEntry(e: Omit<JournalEntry, 'id' | 'at'> & { id?: string }) {
  change((j) => {
    const entry: JournalEntry = { ...e, meta: slim(e.meta), id: e.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
    if (levelOf(entry) === 'title') { delete entry.season; delete entry.episode; delete entry.episodeTitle; }
    const entries = e.id ? j.entries.map((x) => (x.id === e.id ? entry : x)) : [entry, ...j.entries];
    const key = keyOf(entry);
    const latest = entries.filter((x) => keyOf(x) === key).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)[0];
    const level = levelOf(entry);
    const out = { ...j, entries, skipped: (j.skipped || []).filter((id) => id !== key) };
    if (level === 'title') {
      out.marks = { ...j.marks, [entry.meta.id]: { meta: entry.meta, rating: latest.rating, liked: latest.liked ?? j.marks[entry.meta.id]?.liked, at: Date.now() } };
    } else {
      const field = level === 'season' ? 'seasons' : 'episodes';
      const prev = (j[field] || {})[key];
      out[field] = { ...(j[field] || {}), [key]: { rating: latest.rating, liked: latest.liked ?? prev?.liked, at: Date.now() } };
      // La série elle-même entre au journal (sans note) si elle n'y était pas
      if (!j.marks[entry.meta.id]) out.marks = { ...j.marks, [entry.meta.id]: { meta: entry.meta, at: Date.now() } };
    }
    return out;
  });
}

/** « Saison 2 · Épisode 5 » */
export function partLabel(e: { season?: number; episode?: number; episodeTitle?: string }, short = false) {
  if (e.season == null) return '';
  const s = e.season === 0 ? 'Bonus' : short ? `S${e.season}` : `Saison ${e.season}`;
  if (e.episode == null) return s;
  return short ? `${s} · É${e.episode}` : `${s} · Épisode ${e.episode}${e.episodeTitle ? ` · ${e.episodeTitle}` : ''}`;
}

export function deleteEntry(id: string) {
  change((j) => ({ ...j, entries: j.entries.filter((x) => x.id !== id) }));
}

export function setFavorites(ids: string[]) {
  change((j) => ({ ...j, favorites: ids.slice(0, 4) }));
}

/** id : un titre, ou « idSérie:saison » pour une saison terminée */
export function skipToRate(id: string) {
  change((j) => ({ ...j, skipped: [...new Set([...(j.skipped || []), id])] }));
}

// ---------- Statistiques ----------

/** Durée en minutes à partir de « 2h 1min », « 121 min »… */
export function minutesOf(runtime?: string) {
  if (!runtime) return 0;
  const h = /(\d+)\s*h/i.exec(runtime), m = /(\d+)\s*m/i.exec(runtime);
  if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  const n = parseInt(runtime, 10);
  return Number.isFinite(n) ? n : 0;
}

export function statsOf(j: Journal) {
  const year = String(new Date().getFullYear());
  const titles = new Set([...j.entries.map((e) => e.meta.id), ...Object.keys(j.marks)]);
  const rated = Object.values(j.marks).filter((m) => m.rating && m.meta.type !== 'series');
  const hist = Array.from({ length: 10 }, (_, i) => rated.filter((m) => Math.round(m.rating! * 2) === i + 1).length);
  const minutes = j.entries.filter((e) => e.meta.type !== 'series').reduce((n, e) => n + minutesOf(e.meta.runtime), 0);
  return {
    titles: titles.size,
    films: Object.values(j.marks).filter((m) => m.meta.type !== 'series').length,
    series: Object.values(j.marks).filter((m) => m.meta.type === 'series').length,
    seasonsRated: Object.values(j.seasons || {}).filter((m) => m.rating).length,
    thisYear: new Set(j.entries.filter((e) => e.date.startsWith(year)).map((e) => e.meta.id)).size,
    hours: Math.round(minutes / 60),
    reviews: j.entries.filter((e) => e.review?.trim()).length,
    liked: Object.values(j.marks).filter((m) => m.liked).length,
    average: rated.length ? rated.reduce((n, m) => n + m.rating!, 0) / rated.length : 0,
    hist,
  };
}

// ---------- Fenêtre « Ajouter au journal » ----------

export const useLogModal = create<{ meta: MetaPreview | null; entry: JournalEntry | null; preset?: Partial<JournalEntry> }>(() => ({ meta: null, entry: null }));

export function openLog(meta: MetaPreview, opts: { entry?: JournalEntry; preset?: Partial<JournalEntry> } = {}) {
  useLogModal.setState({ meta: slim(meta), entry: opts.entry || null, preset: opts.preset });
}
export const closeLog = () => useLogModal.setState({ meta: null, entry: null, preset: undefined });

// ---------- « Ta note ? » à la fin d'un film ----------

/** kind : film terminé, saison terminée ou série terminée */
export const useRatePrompt = create<{ meta: MetaPreview | null; kind?: 'film' | 'season' | 'series'; season?: number }>(() => ({ meta: null }));

/**
 * Un film, une saison ou une série vient de se terminer : on proposera de le noter (une fois,
 * s'il n'est pas déjà au journal aujourd'hui).
 */
export function finished(meta: MetaPreview, kind: 'film' | 'season' | 'series', season?: number) {
  const cur = useRatePrompt.getState();
  if (cur.meta?.id === meta.id && cur.kind === kind && cur.season === season) return;
  const p = useStore.getState().profiles.find((x) => x.id === useStore.getState().activeProfileId);
  const target = kind === 'season' ? { meta, season } : { meta };
  if (journalOf(p).entries.some((e) => keyOf(e) === keyOf(target) && e.date === today())) return;
  useRatePrompt.setState({ meta: slim(meta), kind, season });
}

/** Note affichée : 3,5 → « ★★★½ » */
export const starsText = (r?: number) => (r ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '');
