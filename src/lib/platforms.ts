// Plateformes de streaming (Netflix, Disney+…) : leurs catalogues viennent de l'addon
// « Streaming Catalogs », et NOCTA les présente comme des pages à part entière.
import { browsableCatalogs, getCatalogPage, isCinemeta, supportsSkip } from './addons';
import type { CatalogDef, InstalledAddon, MetaPreview } from './types';

export interface PlatformStyle {
  id: string;
  name: string;
  match: RegExp;
  /** Couleur de la marque (lueurs, accents) */
  color: string;
  /** Fond des tuiles et de la page */
  bg: string;
  /** Style du nom (classe CSS) */
  mark: string;
}

const STYLES: PlatformStyle[] = [
  { id: 'netflixkids', name: 'Netflix Kids', match: /netflix\s*kids/i, color: '#e50914', bg: 'linear-gradient(135deg, #3a0306, #0b0b0e 70%)', mark: 'pf-mark-netflix' },
  { id: 'netflix', name: 'Netflix', match: /netflix|\bnfx\b/i, color: '#e50914', bg: 'linear-gradient(135deg, #2a0204 0%, #0b0b0e 70%)', mark: 'pf-mark-netflix' },
  { id: 'disney', name: 'Disney+', match: /disney|\bdnp\b/i, color: '#1f80e0', bg: 'linear-gradient(135deg, #0d2357 0%, #071228 55%, #04060f 100%)', mark: 'pf-mark-disney' },
  { id: 'prime', name: 'Prime Video', match: /prime|amazon|\bamp\b/i, color: '#1a98ff', bg: 'linear-gradient(135deg, #0b2a44 0%, #071522 60%, #05080d 100%)', mark: 'pf-mark-prime' },
  { id: 'apple', name: 'Apple TV+', match: /apple|\batp\b/i, color: '#f5f5f7', bg: 'linear-gradient(135deg, #2b2b30 0%, #101012 60%, #000 100%)', mark: 'pf-mark-apple' },
  { id: 'max', name: 'Max', match: /hbo|\bmax\b|\bhbm\b/i, color: '#7b5cff', bg: 'linear-gradient(135deg, #1d1259 0%, #0c0828 60%, #05040e 100%)', mark: 'pf-mark-max' },
  { id: 'canal', name: 'Canal+', match: /canal|\bcpd\b/i, color: '#ffffff', bg: 'linear-gradient(135deg, #1f1f1f 0%, #0a0a0a 60%, #000 100%)', mark: 'pf-mark-canal' },
  { id: 'crunchyroll', name: 'Crunchyroll', match: /crunchy|\bcru\b/i, color: '#f47521', bg: 'linear-gradient(135deg, #4a1e05 0%, #1a0b03 60%, #0b0b0e 100%)', mark: 'pf-mark-crunchy' },
  { id: 'mubi', name: 'MUBI', match: /mubi/i, color: '#4d6bff', bg: 'linear-gradient(135deg, #0f1a5c 0%, #070b26 60%, #04050f 100%)', mark: 'pf-mark-mubi' },
  { id: 'paramount', name: 'Paramount+', match: /paramount|\bpmp\b/i, color: '#0064ff', bg: 'linear-gradient(135deg, #062a6b 0%, #04122e 60%, #03060f 100%)', mark: 'pf-mark-paramount' },
  { id: 'skyshowtime', name: 'SkyShowtime', match: /skyshowtime|\bsst\b/i, color: '#b44dff', bg: 'linear-gradient(135deg, #2d0a4a 0%, #120420 60%, #07030c 100%)', mark: 'pf-mark-generic' },
  { id: 'hulu', name: 'Hulu', match: /hulu/i, color: '#1ce783', bg: 'linear-gradient(135deg, #063d24 0%, #04170f 60%, #030806 100%)', mark: 'pf-mark-generic' },
  { id: 'peacock', name: 'Peacock', match: /peacock/i, color: '#fbc531', bg: 'linear-gradient(135deg, #2a2a2a 0%, #0e0e0e 60%, #000 100%)', mark: 'pf-mark-generic' },
];

const GENERIC = (id: string, name: string): PlatformStyle => ({
  id, name, match: /$^/, color: '#e5e5e5', bg: 'linear-gradient(135deg, #24242b 0%, #0f0f13 60%, #08080a 100%)', mark: 'pf-mark-generic',
});

export interface Platform extends PlatformStyle {
  addon: InstalledAddon;
  movie?: CatalogDef;
  series?: CatalogDef;
}

const styleOf = (c: CatalogDef) => STYLES.find((s) => s.match.test(`${c.name || ''} ${c.id}`));

/** L'addon « Streaming Catalogs » (ou un addon du même genre : plusieurs catalogues de plateformes) */
export function isPlatformAddon(a: InstalledAddon) {
  if (/netflix-catalog|streaming-catalogs/i.test(a.manifest.id) || /streaming catalogs/i.test(a.manifest.name)) return true;
  const cats = browsableCatalogs([a]);
  return cats.filter((c) => styleOf(c.catalog)).length >= 2;
}

/** Les plateformes disponibles, dans l'ordre de l'addon */
export function platformsOf(addons: InstalledAddon[]): Platform[] {
  const out = new Map<string, Platform>();
  for (const addon of addons.filter((a) => !isCinemeta(a) && isPlatformAddon(a))) {
    for (const { catalog } of browsableCatalogs([addon])) {
      if (catalog.type !== 'movie' && catalog.type !== 'series') continue;
      const style = styleOf(catalog) || GENERIC(`x-${catalog.id}`, (catalog.name || catalog.id).replace(/\s*[-·]\s*(movies?|films?|series|séries|shows?)$/i, ''));
      const p = out.get(style.id) || { ...style, addon };
      if (catalog.type === 'movie' && !p.movie) p.movie = catalog;
      if (catalog.type === 'series' && !p.series) p.series = catalog;
      out.set(style.id, p);
    }
  }
  return [...out.values()];
}

/** Autres addons de catalogue (ni sources comme Torrentio, ni métadonnées, ni plateformes) */
export function otherCatalogAddons(addons: InstalledAddon[]) {
  return addons.filter((a) => {
    if (isCinemeta(a) || isPlatformAddon(a)) return false;
    const res = new Set((a.manifest.resources || []).map((r) => (typeof r === 'string' ? r : r.name)));
    if (res.has('stream') || res.has('meta')) return false;
    return browsableCatalogs([a]).length > 0;
  });
}

export function pageOf(p: Platform, type: 'movie' | 'series', skip = 0): Promise<MetaPreview[]> {
  const c = type === 'movie' ? p.movie : p.series;
  if (!c) return Promise.resolve([]);
  return getCatalogPage(p.addon, type, c.id, {}, skip);
}

export const pageable = (p: Platform, type: 'movie' | 'series') => supportsSkip(type === 'movie' ? p.movie : p.series);

/** Plusieurs pages d'un coup (pour les rangées par genre et les mieux notés) */
export async function firstPages(p: Platform, type: 'movie' | 'series', pages = 3): Promise<MetaPreview[]> {
  const out: MetaPreview[] = [];
  const seen = new Set<string>();
  let skip = 0;
  for (let i = 0; i < pages; i++) {
    const list = await pageOf(p, type, skip).catch(() => [] as MetaPreview[]);
    const add = list.filter((m) => !seen.has(m.id) && seen.add(m.id));
    out.push(...add);
    if (!list.length || !add.length || !pageable(p, type)) break;
    skip += list.length;
  }
  return out;
}

/** Films et séries mélangés, un sur deux */
export function interleave(a: MetaPreview[], b: MetaPreview[]) {
  const out: MetaPreview[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}
