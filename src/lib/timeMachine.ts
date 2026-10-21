// Machine à remonter le temps : les films de chaque année (catalogue « par année » de Cinemeta)
// et les grandes époques du cinéma, avec leur ambiance visuelle.
import { getCatalogPage, mainAddons } from './addons';
import type { InstalledAddon, MetaPreview } from './types';

export const FIRST_YEAR = 1920;
export const LAST_YEAR = new Date().getFullYear();

export interface Era {
  from: number;
  title: string;
  text: string;
  color: string;
}

/** Les époques, avec une phrase pour situer chacune */
export const ERAS: Era[] = [
  { from: 1920, title: 'Les Années folles', text: 'Le cinéma muet à son sommet : Chaplin, Keaton, l\'expressionnisme allemand. En 1927, Le Chanteur de jazz fait parler l\'écran.', color: '#d9c7a3' },
  { from: 1930, title: 'L\'arrivée du parlant', text: 'Hollywood invente ses genres : films de gangsters, comédies musicales et monstres Universal.', color: '#c9c9c9' },
  { from: 1940, title: 'L\'âge d\'or d\'Hollywood', text: 'Le film noir, Casablanca, Citizen Kane : les grands studios règnent en maîtres.', color: '#b8b8b8' },
  { from: 1950, title: 'Technicolor et CinémaScope', text: 'Face à la télévision, l\'écran s\'élargit et les couleurs explosent. Hitchcock est au sommet.', color: '#ffb347' },
  { from: 1960, title: 'La Nouvelle Vague', text: 'Godard, Truffaut, Kubrick, Leone : le cinéma d\'auteur bouscule toutes les règles.', color: '#ff7a59' },
  { from: 1970, title: 'Le Nouvel Hollywood', text: 'Coppola, Scorsese, Spielberg… Le Parrain, Les Dents de la mer et la naissance du blockbuster.', color: '#e0a060' },
  { from: 1980, title: 'Les Années 80', text: 'Néons, synthés et aventures : Star Wars, Retour vers le futur, E.T., les débuts de Pixar.', color: '#ff3cac' },
  { from: 1990, title: 'Les Années 90', text: 'L\'ère de la VHS : Tarantino, Jurassic Park, Titanic, Matrix et les premiers effets numériques.', color: '#7fdbe6' },
  { from: 2000, title: 'Les Années 2000', text: 'Les sagas géantes : Le Seigneur des anneaux, Harry Potter, Pirates des Caraïbes.', color: '#5ab0ff' },
  { from: 2010, title: 'Les Années 2010', text: 'Les super-héros dominent le box-office, et les séries deviennent aussi ambitieuses que le cinéma.', color: '#b28cff' },
  { from: 2020, title: 'Aujourd\'hui', text: 'Le streaming change tout : on regarde où on veut, quand on veut.', color: '#ffffff' },
];

export const eraOf = (year: number) => [...ERAS].reverse().find((e) => year >= e.from) || ERAS[0];

const cache = new Map<number, Promise<MetaPreview[]>>();

const rating = (m: MetaPreview) => parseFloat(String(m.imdbRating || '')) || 0;

/**
 * Les mieux notés : note IMDb d'au moins 7 (6,5 si l'année en a trop peu), du meilleur au
 * moins bon. Les titres sans note passent en dernier, seulement s'il manque de quoi remplir.
 */
function best(list: MetaPreview[], n: number): MetaPreview[] {
  const seen = new Set<string>();
  const uniq = list.filter((x) => x.poster && !seen.has(x.id) && seen.add(x.id));
  const sorted = [...uniq].sort((a, b) => rating(b) - rating(a));
  let pick = sorted.filter((x) => rating(x) >= 7);
  if (pick.length < n) pick = sorted.filter((x) => rating(x) >= 6.5);
  if (pick.length < Math.min(6, n)) pick = sorted;
  return pick.slice(0, n);
}

/** Les films (et quelques séries) les mieux notés d'une année */
export function loadYear(addons: InstalledAddon[], year: number): Promise<MetaPreview[]> {
  if (cache.has(year)) return cache.get(year)!;
  const job = (async () => {
    const main = mainAddons(addons);
    const find = (type: string) => {
      for (const addon of main) {
        const c = (addon.manifest.catalogs || []).find((x) => x.type === type && x.id === 'year');
        if (c) return { addon, c };
      }
      // Cinemeta sait filtrer par année même si son manifeste ne le déclare pas
      return main[0] ? { addon: main[0], c: { id: 'year' } } : null;
    };
    const m = find('movie'), s = year >= 1950 ? find('series') : null;
    // Les plus populaires de l'année (deux pages), puis on ne garde que les mieux notés
    const fetchAll = async (f: typeof m, type: string) => {
      if (!f) return [] as MetaPreview[];
      const first = await getCatalogPage(f.addon, type, f.c.id, { genre: String(year) }).catch(() => [] as MetaPreview[]);
      const more = first.length >= 40 ? await getCatalogPage(f.addon, type, f.c.id, { genre: String(year) }, first.length).catch(() => [] as MetaPreview[]) : [];
      return [...first, ...more];
    };
    const [movies, series] = await Promise.all([fetchAll(m, 'movie'), fetchAll(s, 'series')]);
    return [...best(movies, 14), ...best(series, 4)];
  })();
  cache.set(year, job);
  job.catch(() => cache.delete(year));
  return job;
}
