// NOCTA Mini : catalogues (Cinemeta) et petits utilitaires d'affichage
import { getCatalog, GENRE_FR, isCinemeta } from '../lib/addons';
import { useStore } from '../lib/store';
import type { MetaPreview } from '../lib/types';

export type Kind = 'movie' | 'series';

export interface ShelfDef { key: string; title: string; load: () => Promise<MetaPreview[]> }

const cache = new Map<string, Promise<MetaPreview[]>>();

/** Un catalogue Cinemeta (mémorisé le temps de la session) */
export function catalog(type: Kind, id: string, extra?: Record<string, string>): Promise<MetaPreview[]> {
  const addon = useStore.getState().addons.find(isCinemeta);
  if (!addon) return Promise.resolve([]);
  const key = `${type}|${id}|${JSON.stringify(extra || {})}`;
  if (!cache.has(key)) {
    const job = getCatalog(addon, type, id, extra).catch(() => []);
    cache.set(key, job);
    job.then((r) => { if (!r.length) cache.delete(key); });
  }
  return cache.get(key)!;
}

const YEAR = String(new Date().getFullYear());
const genre = (type: Kind, g: string): ShelfDef => ({
  key: `${type}|g|${g}`,
  title: GENRE_FR[g] || g,
  load: () => catalog(type, 'top', { genre: g }),
});

/** Les rangées de chaque section, dans l'ordre */
export const SHELVES: Record<Kind, ShelfDef[]> = {
  movie: [
    { key: 'movie|top', title: 'Populaires', load: () => catalog('movie', 'top') },
    { key: 'movie|year', title: `Sortis en ${YEAR}`, load: () => catalog('movie', 'year', { genre: YEAR }) },
    { key: 'movie|rated', title: 'Les mieux notés', load: () => catalog('movie', 'imdbRating') },
    genre('movie', 'Drama'),
    genre('movie', 'Thriller'),
    genre('movie', 'Comedy'),
    genre('movie', 'Sci-Fi'),
    genre('movie', 'Animation'),
    genre('movie', 'Documentary'),
  ],
  series: [
    { key: 'series|top', title: 'Populaires', load: () => catalog('series', 'top') },
    { key: 'series|year', title: `Nouveautés ${YEAR}`, load: () => catalog('series', 'year', { genre: YEAR }) },
    { key: 'series|rated', title: 'Les mieux notées', load: () => catalog('series', 'imdbRating') },
    genre('series', 'Drama'),
    genre('series', 'Crime'),
    genre('series', 'Comedy'),
    genre('series', 'Sci-Fi'),
    genre('series', 'Animation'),
    genre('series', 'Documentary'),
  ],
};

/** Année seule (« 2019 », « 2019– ») */
export const yearOf = (m: MetaPreview) => (m.releaseInfo || '').slice(0, 4);

/** Genres en français, trois au plus */
export const genresOf = (m: MetaPreview) => (m.genres || []).slice(0, 3).map((g) => GENRE_FR[g] || g);

/** « 2 h 08 » à partir de « 128 min » */
export function runtimeOf(m: MetaPreview) {
  const n = parseInt(m.runtime || '', 10);
  if (!n) return '';
  return n >= 60 ? `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}` : `${n} min`;
}
