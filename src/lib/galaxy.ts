// Données de la Galaxie : chaque genre devient une nébuleuse, chaque film ou série une étoile
// (son affiche). Les titres de l'utilisateur (en cours, Ma liste) forment sa constellation.
import { browsableCatalogs, getCatalogPage, mainAddons } from './addons';
import type { InstalledAddon, MetaPreview, Profile } from './types';

/** Surface d'une planète : géante gazeuse à bandes, continents, lave, glace, toxique, océan */
export type PlanetKind = 'gas' | 'rock' | 'lava' | 'ice' | 'toxic' | 'ocean';

export interface Nebula {
  genre: string;
  label: string;
  color: string;
  /** Couleurs de la surface (du plus sombre au plus clair) */
  palette: [string, string, string];
  kind: PlanetKind;
  /** Anneau décoratif façon Saturne */
  ring?: boolean;
  stars: MetaPreview[];
}

/** Les planètes, de la plus proche du soleil à la plus lointaine */
export const NEBULAE: Omit<Nebula, 'stars'>[] = [
  { genre: 'Action', label: 'Action', color: '#ff5a36', palette: ['#3a0d05', '#c2361a', '#ffb347'], kind: 'lava' },
  { genre: 'Comedy', label: 'Comédie', color: '#ffd166', palette: ['#7a4a10', '#e9a93b', '#fff1c4'], kind: 'gas', ring: true },
  { genre: 'Sci-Fi', label: 'Science-fiction', color: '#4cc9f0', palette: ['#0b2a4a', '#3c8fd6', '#d8f4ff'], kind: 'ice' },
  { genre: 'Animation', label: 'Animation', color: '#06d6a0', palette: ['#0b3a6e', '#2fb36d', '#f4e7a1'], kind: 'rock' },
  { genre: 'Horror', label: 'Horreur', color: '#ff1e3c', palette: ['#0a0204', '#3b0710', '#ff2a3c'], kind: 'lava' },
  { genre: 'Drama', label: 'Drame', color: '#b28cff', palette: ['#1d1240', '#6a4fc4', '#e6dcff'], kind: 'gas' },
  { genre: 'Romance', label: 'Romance', color: '#ff6fae', palette: ['#4a1030', '#e0508f', '#ffd6e8'], kind: 'gas', ring: true },
  { genre: 'Crime', label: 'Polar', color: '#f77f00', palette: ['#1a1410', '#5c4a3a', '#d9a066'], kind: 'rock' },
  { genre: 'Fantasy', label: 'Fantastique', color: '#9b5de5', palette: ['#160a33', '#7b3fe4', '#7fffd4'], kind: 'toxic' },
  { genre: 'Thriller', label: 'Thriller', color: '#3a86ff', palette: ['#050c24', '#1b3f99', '#7fb2ff'], kind: 'ocean' },
  { genre: 'Adventure', label: 'Aventure', color: '#2ec4b6', palette: ['#0d4a5c', '#3fae6a', '#e8d6a0'], kind: 'rock', ring: true },
  { genre: 'Documentary', label: 'Documentaire', color: '#e9c46a', palette: ['#3d3326', '#a68a5b', '#f2e6c9'], kind: 'rock' },
];

/** Ta planète : tes titres en cours et ta liste */
export const MY_PLANET: Omit<Nebula, 'stars'> = { genre: 'mine', label: 'Ta planète', color: '#ffd166', palette: ['#5a3a08', '#e0a526', '#fff4cf'], kind: 'gas', ring: true };

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
