import type { CatalogDef, InstalledAddon, Manifest, Meta, MetaPreview, Stream } from './types';

// Client du protocole d'addons Stremio
// https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

export const CINEMETA_URL = 'https://v3-cinemeta.strem.io/manifest.json';
export const OPENSUBTITLES_URL = 'https://opensubtitles-v3.strem.io/manifest.json';

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western',
];

// Manifest Cinemeta embarqué : l'app affiche quelque chose dès le 1er lancement,
// il est rafraîchi depuis le réseau au démarrage.
export const CINEMETA_FALLBACK: Manifest = {
  id: 'com.linvo.cinemeta',
  name: 'Cinemeta',
  version: '3.0.0',
  description: 'Catalogue officiel films & séries (IMDb).',
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  resources: ['catalog', 'meta'],
  catalogs: [
    { type: 'movie', id: 'top', name: 'Popular', extra: [{ name: 'genre', options: GENRES }, { name: 'search' }, { name: 'skip' }] },
    { type: 'series', id: 'top', name: 'Popular', extra: [{ name: 'genre', options: GENRES }, { name: 'search' }, { name: 'skip' }] },
    { type: 'movie', id: 'year', name: 'New', extra: [{ name: 'genre', isRequired: true, options: ['2026', '2025', '2024'] }] },
    { type: 'series', id: 'year', name: 'New', extra: [{ name: 'genre', isRequired: true, options: ['2026', '2025', '2024'] }] },
    { type: 'movie', id: 'imdbRating', name: 'Featured', extra: [{ name: 'genre', options: GENRES }, { name: 'skip' }] },
    { type: 'series', id: 'imdbRating', name: 'Featured', extra: [{ name: 'genre', options: GENRES }, { name: 'skip' }] },
  ],
};

export const GENRE_FR: Record<string, string> = {
  Action: 'Action', Adventure: 'Aventure', Animation: 'Animation', Biography: 'Biopics', Comedy: 'Comédies',
  Crime: 'Polars', Documentary: 'Documentaires', Drama: 'Drames', Family: 'En famille', Fantasy: 'Fantastique',
  History: 'Histoire', Horror: 'Horreur', Mystery: 'Mystère', Romance: 'Romance', 'Sci-Fi': 'Science-fiction',
  Sport: 'Sport', Thriller: 'Thrillers', War: 'Guerre', Western: 'Westerns', Music: 'Musique', Musical: 'Comédies musicales',
  'Talk-Show': 'Talk-shows', 'Reality-TV': 'Téléréalité', 'Game-Show': 'Jeux TV', News: 'Actualités',
};

export const typeLabel = (t: string) => (t === 'movie' ? 'Films' : t === 'series' ? 'Séries' : t === 'tv' ? 'TV' : t);

export function catalogTitle(addon: InstalledAddon, c: CatalogDef): string {
  const tl = typeLabel(c.type);
  if (addon.manifest.id === 'com.linvo.cinemeta') {
    if (c.id === 'top') return `${tl} populaires`;
    if (c.id === 'imdbRating') return `${tl} les mieux notés`;
    if (c.id === 'year') return `${tl} récents`;
  }
  return c.name ? `${c.name} · ${tl}` : tl;
}

export function normalizeManifestUrl(input: string): string {
  let u = input.trim();
  if (u.startsWith('stremio://')) u = 'https://' + u.slice('stremio://'.length);
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  if (!/manifest\.json(\?.*)?$/.test(u)) u = u.replace(/\/+$/, '') + '/manifest.json';
  return u;
}

const baseOf = (manifestUrl: string) => manifestUrl.replace(/\/manifest\.json(\?.*)?$/, '');

async function getJson(url: string, timeout = 20000): Promise<any> {
  if (window.nocta) {
    const r = await window.nocta.http(url, { timeout });
    if (!r.ok) throw new Error(r.error || `HTTP ${r.status}`);
    return r.data;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Petit cache mémoire (5 min)
const cache = new Map<string, { at: number; p: Promise<any> }>();
function cachedJson(url: string): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.p;
  const p = getJson(url).catch((e) => { cache.delete(url); throw e; });
  cache.set(url, { at: Date.now(), p });
  return p;
}

export async function fetchManifest(url: string): Promise<Manifest> {
  const m = await getJson(normalizeManifestUrl(url));
  if (!m || typeof m !== 'object' || !m.id || !m.name) throw new Error('Manifest invalide');
  return m as Manifest;
}

export function supports(addon: InstalledAddon, resource: string, type?: string, id?: string): boolean {
  const m = addon.manifest;
  for (const r of m.resources || []) {
    const name = typeof r === 'string' ? r : r.name;
    if (name !== resource) continue;
    const types = (typeof r === 'object' && r.types) || m.types || [];
    const prefixes = (typeof r === 'object' && r.idPrefixes) || m.idPrefixes;
    if (type && types.length && !types.includes(type)) continue;
    if (id && prefixes && prefixes.length && !prefixes.some((p) => id.startsWith(p))) continue;
    return true;
  }
  return false;
}

function extraPath(extra?: Record<string, string>): string {
  if (!extra) return '';
  const parts = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? '/' + parts.join('&') : '';
}

export async function getCatalog(addon: InstalledAddon, type: string, id: string, extra?: Record<string, string>): Promise<MetaPreview[]> {
  const url = `${baseOf(addon.url)}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extraPath(extra)}.json`;
  const d = await cachedJson(url);
  return ((d && d.metas) || []).filter((m: MetaPreview) => m && m.id && m.name);
}

export async function getMeta(addons: InstalledAddon[], type: string, id: string): Promise<Meta | null> {
  for (const a of addons.filter((a) => supports(a, 'meta', type, id))) {
    try {
      const d = await cachedJson(`${baseOf(a.url)}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`);
      if (d && d.meta) return d.meta as Meta;
    } catch {}
  }
  return null;
}

export interface StreamGroup { addon: InstalledAddon; streams: Stream[]; error?: string }

export async function getStreams(addons: InstalledAddon[], type: string, id: string): Promise<StreamGroup[]> {
  const targets = addons.filter((a) => supports(a, 'stream', type, id));
  const results = await Promise.allSettled(
    targets.map((a) => getJson(`${baseOf(a.url)}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, 30000)),
  );
  return results.map((r, i) => ({
    addon: targets[i],
    streams: r.status === 'fulfilled' ? ((r.value && r.value.streams) || []) : [],
    error: r.status === 'rejected' ? String((r.reason && r.reason.message) || r.reason) : undefined,
  }));
}

export interface SubtitleTrack { id: string; url: string; lang: string; addon: string }

export async function getSubtitles(addons: InstalledAddon[], type: string, id: string): Promise<SubtitleTrack[]> {
  const targets = addons.filter((a) => supports(a, 'subtitles', type, id));
  const results = await Promise.allSettled(
    targets.map((a) => cachedJson(`${baseOf(a.url)}/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`)),
  );
  const out: SubtitleTrack[] = [];
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    for (const s of (r.value && r.value.subtitles) || []) {
      if (s && s.url) out.push({ id: s.id || s.url, url: s.url, lang: s.lang || '?', addon: targets[i].manifest.name });
    }
  });
  return out;
}

/** Catalogues affichables directement (sans filtre obligatoire) */
export function browsableCatalogs(addons: InstalledAddon[], type?: string) {
  const out: { addon: InstalledAddon; catalog: CatalogDef }[] = [];
  for (const addon of addons) {
    for (const c of addon.manifest.catalogs || []) {
      if (type && c.type !== type) continue;
      const required = (c.extra || []).some((e) => e.isRequired) || (c.extraRequired || []).length > 0;
      if (required) continue;
      out.push({ addon, catalog: c });
    }
  }
  return out;
}

export function searchableCatalogs(addons: InstalledAddon[]) {
  const out: { addon: InstalledAddon; catalog: CatalogDef }[] = [];
  for (const addon of addons) {
    for (const c of addon.manifest.catalogs || []) {
      const ok = (c.extra || []).some((e) => e.name === 'search') || (c.extraSupported || []).includes('search');
      if (ok) out.push({ addon, catalog: c });
    }
  }
  return out;
}

/** Infos qualité extraites du nom d'un stream ("1080p", "4K", "HDR"…) */
export function streamQuality(s: Stream): { res: number; label: string; tags: string[] } {
  const text = `${s.name || ''} ${s.title || ''} ${s.description || ''} ${s.behaviorHints?.filename || ''}`;
  let res = 0;
  if (/2160p|\b4k\b|uhd/i.test(text)) res = 2160;
  else if (/1440p/i.test(text)) res = 1440;
  else if (/1080p|fhd/i.test(text)) res = 1080;
  else if (/720p/i.test(text)) res = 720;
  else if (/480p|sd\b/i.test(text)) res = 480;
  const tags: string[] = [];
  if (/dolby ?vision|\bdv\b/i.test(text)) tags.push('Dolby Vision');
  else if (/hdr10\+?|\bhdr\b/i.test(text)) tags.push('HDR');
  if (/atmos/i.test(text)) tags.push('Atmos');
  if (/hevc|x265|h\.?265/i.test(text)) tags.push('HEVC');
  if (/\bfrench\b|\bvff\b|\bvf\b|\btruefrench\b|🇫🇷/i.test(text)) tags.push('VF');
  if (/multi/i.test(text)) tags.push('MULTI');
  if (/vostfr/i.test(text)) tags.push('VOSTFR');
  const label = res >= 2160 ? '4K' : res ? `${res}p` : '';
  return { res, label, tags };
}

export function streamSize(s: Stream): string {
  const m = /([\d.,]+)\s?(GB|Go|MB|Mo|GiB|MiB)/i.exec(`${s.title || ''} ${s.description || ''}`);
  if (m) return `${m[1]} ${m[2].toUpperCase().replace('GIB', 'GB').replace('MIB', 'MB')}`;
  const b = s.behaviorHints?.videoSize;
  if (b) return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`;
  return '';
}
