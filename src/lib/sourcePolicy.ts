// Tri des sources selon tes envies : pas de 4K / HDR, et seulement la langue voulue
// (VF, ou VO pour un titre réglé en « VO · sous-titres FR »). Le nom du torrent sert de
// premier filtre, la vérification du fichier (langCheck) a toujours le dernier mot.
import { streamQuality } from './addons';
import { cachedLang, fitsVerified } from './langCheck';
import { langPrefsFor } from './langPrefs';
import { useStore } from './store';
import type { Stream } from './types';

/** 4K, HDR ou Dolby Vision */
export function isUhd(s: Stream): boolean {
  const q = streamQuality(s);
  return q.res >= 2160 || q.tags.includes('HDR') || q.tags.includes('Dolby Vision');
}

/** La source correspond-elle à la langue voulue, d'après la vérification ou à défaut son nom ? */
export function fitsLang(s: Stream, want: 'vf' | 'vo' | null): boolean {
  if (!want) return true;
  const verified = fitsVerified(cachedLang(s), want);
  if (verified !== null) return verified;
  const t = streamQuality(s).tags;
  if (want === 'vf') return t.includes('VF') || t.includes('MULTI');
  // VO : VOSTFR, MULTI (contient la VO) ou sans mention de langue (donc en version originale)
  return t.includes('VOSTFR') || t.includes('MULTI') || !t.includes('VF');
}

export interface Filtered<T> {
  kept: T[];
  hiddenUhd: number;
  hiddenLang: number;
  /** Rien ne correspondait à la langue voulue : toutes les langues sont gardées */
  langRelaxed: boolean;
}

/** Garde les sources qui conviennent ; ne laisse jamais la liste vide s'il existe des sources */
export function filterSources<T extends { stream: Stream }>(rows: T[], metaId?: string, opts: { showAll?: boolean } = {}): Filtered<T> {
  if (opts.showAll) return { kept: rows, hiddenUhd: 0, hiddenLang: 0, langRelaxed: false };
  const hide = useStore.getState().settings.hideUhd !== false;
  const want = langPrefsFor(metaId).want;
  let pool = hide ? rows.filter((r) => !isUhd(r.stream)) : rows;
  if (!pool.length) pool = rows; // uniquement du 4K : mieux que rien
  const hiddenUhd = rows.length - pool.length;
  const inLang = pool.filter((r) => fitsLang(r.stream, want));
  if (!inLang.length) return { kept: pool, hiddenUhd, hiddenLang: 0, langRelaxed: !!want && pool.length > 0 };
  return { kept: inLang, hiddenUhd, hiddenLang: pool.length - inLang.length, langRelaxed: false };
}
