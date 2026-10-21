// Données de la Galaxie : chaque genre devient une nébuleuse, chaque film ou série une étoile
// (son affiche). Les titres de l'utilisateur (en cours, Ma liste) forment sa constellation.
import { browsableCatalogs, getCatalogPage, mainAddons } from './addons';
import type { InstalledAddon, MetaPreview, Profile } from './types';

export interface Nebula {
  genre: string;
  label: string;
  color: string;
  stars: MetaPreview[];
}

/** Les nébuleuses, dans l'ordre où elles s'enroulent sur les bras de la galaxie */
export const NEBULAE: { genre: string; label: string; color: string }[] = [
  { genre: 'Action', label: 'Action', color: '#ff5a36' },
  { genre: 'Sci-Fi', label: 'Science-fiction', color: '#4cc9f0' },
  { genre: 'Horror', label: 'Horreur', color: '#ff1e3c' },
  { genre: 'Comedy', label: 'Comédie', color: '#ffd166' },
  { genre: 'Drama', label: 'Drame', color: '#b28cff' },
  { genre: 'Animation', label: 'Animation', color: '#06d6a0' },
  { genre: 'Crime', label: 'Polar', color: '#f77f00' },
  { genre: 'Romance', label: 'Romance', color: '#ff6fae' },
  { genre: 'Fantasy', label: 'Fantastique', color: '#9b5de5' },
  { genre: 'Thriller', label: 'Thriller', color: '#3a86ff' },
  { genre: 'Adventure', label: 'Aventure', color: '#2ec4b6' },
  { genre: 'Documentary', label: 'Documentaire', color: '#e9c46a' },
];

let cache: { key: string; data: Promise<Nebula[]> } | null = null;

/** Films et séries les plus populaires de chaque genre (catalogues de la fiche principale) */
export function loadGalaxy(addons: InstalledAddon[]): Promise<Nebula[]> {
  const key = addons.map((a) => a.url).join('|');
  if (cache?.key === key) return cache.data;
  const data = (async () => {
    const cats = browsableCatalogs(mainAddons(addons));
    const movie = cats.find((c) => c.catalog.type === 'movie' && (c.catalog.extra || []).some((e) => e.name === 'genre'));
    const series = cats.find((c) => c.catalog.type === 'series' && (c.catalog.extra || []).some((e) => e.name === 'genre'));
    const seen = new Set<string>();
    const lists = await Promise.all(NEBULAE.map(async (n) => {
      const [m, s] = await Promise.all([
        movie ? getCatalogPage(movie.addon, 'movie', movie.catalog.id, { genre: n.genre }).catch(() => []) : [],
        series ? getCatalogPage(series.addon, 'series', series.catalog.id, { genre: n.genre }).catch(() => []) : [],
      ]);
      return { n, items: [...m.slice(0, 26), ...s.slice(0, 16)] };
    }));
    // Un titre n'appartient qu'à une nébuleuse : la première où il apparaît
    return lists.map(({ n, items }) => ({
      ...n,
      stars: items.filter((x) => x.poster && !seen.has(x.id) && seen.add(x.id)),
    })).filter((n) => n.stars.length);
  })();
  cache = { key, data };
  data.catch(() => { cache = null; });
  return data;
}

/** Titres de l'utilisateur, du plus récent au plus ancien */
export function myTitles(profile?: Profile | null): MetaPreview[] {
  if (!profile) return [];
  const prog = Object.values(profile.progress || {}).sort((a, b) => b.updatedAt - a.updatedAt).map((e) => e.meta);
  const seen = new Set<string>();
  return [...prog, ...(profile.myList || [])].filter((m) => m && !seen.has(m.id) && seen.add(m.id)).slice(0, 30);
}
