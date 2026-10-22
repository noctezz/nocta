// Journal (façon Letterboxd) : notes en demi-étoiles, coups de cœur, critiques, séances datées
// et 4 films favoris, propres à chaque profil et enregistrés avec lui.
import { create } from 'zustand';
import { useStore } from './store';
import type { Journal, JournalEntry, FilmMark, MetaPreview, Profile } from './types';

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

/** Ajoute ou modifie une séance ; la note du titre suit la séance la plus récente */
export function saveEntry(e: Omit<JournalEntry, 'id' | 'at'> & { id?: string }) {
  change((j) => {
    const entry: JournalEntry = { ...e, meta: slim(e.meta), id: e.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
    const entries = e.id ? j.entries.map((x) => (x.id === e.id ? entry : x)) : [entry, ...j.entries];
    const latest = entries.filter((x) => x.meta.id === entry.meta.id).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)[0];
    const marks = { ...j.marks, [entry.meta.id]: { meta: entry.meta, rating: latest.rating, liked: latest.liked ?? j.marks[entry.meta.id]?.liked, at: Date.now() } };
    return { ...j, entries, marks, skipped: (j.skipped || []).filter((id) => id !== entry.meta.id) };
  });
}

export function deleteEntry(id: string) {
  change((j) => ({ ...j, entries: j.entries.filter((x) => x.id !== id) }));
}

export function setFavorites(ids: string[]) {
  change((j) => ({ ...j, favorites: ids.slice(0, 4) }));
}

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
  const rated = Object.values(j.marks).filter((m) => m.rating);
  const hist = Array.from({ length: 10 }, (_, i) => rated.filter((m) => Math.round(m.rating! * 2) === i + 1).length);
  const minutes = j.entries.filter((e) => e.meta.type !== 'series').reduce((n, e) => n + minutesOf(e.meta.runtime), 0);
  return {
    titles: titles.size,
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

export const useRatePrompt = create<{ meta: MetaPreview | null }>(() => ({ meta: null }));

/** Un film vient de se terminer : on proposera de le noter (une fois, s'il n'est pas déjà au journal aujourd'hui) */
export function filmFinished(meta: MetaPreview) {
  if (meta.type === 'series') return;
  if (useRatePrompt.getState().meta?.id === meta.id) return;
  const p = useStore.getState().profiles.find((x) => x.id === useStore.getState().activeProfileId);
  if (journalOf(p).entries.some((e) => e.meta.id === meta.id && e.date === today())) return;
  useRatePrompt.setState({ meta: slim(meta) });
}

/** Note affichée : 3,5 → « ★★★½ » */
export const starsText = (r?: number) => (r ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '');
