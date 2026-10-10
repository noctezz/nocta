export interface Cue { start: number; end: number; html: string }

function ts(s: string): number {
  const p = s.replace(',', '.').split(':').map(Number);
  if (p.some((x) => isNaN(x))) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** WebVTT (ou SRT) -> liste de répliques, HTML assaini (seuls <i>, <b>, <u> conservés) */
export function parseVtt(text: string): Cue[] {
  const out: Cue[] = [];
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, c] = lines[i].split('-->').map((x) => x.trim().split(/\s+/)[0]);
    const raw = lines.slice(i + 1).join('\n').replace(/\{\\[^}]*\}/g, '');
    const html = escape(raw)
      .replace(/&lt;(\/?)(i|b|u)&gt;/gi, '<$1$2>')
      .replace(/&lt;[^&]*?&gt;/g, '')
      .replace(/\n/g, '<br/>');
    if (html.trim()) out.push({ start: ts(a), end: ts(c), html });
  }
  return out.sort((x, y) => x.start - y.start);
}

const LANGS: Record<string, string> = {
  fre: 'Français', fra: 'Français', fr: 'Français', eng: 'Anglais', en: 'Anglais', spa: 'Espagnol', es: 'Espagnol',
  ger: 'Allemand', deu: 'Allemand', de: 'Allemand', ita: 'Italien', it: 'Italien', por: 'Portugais', pt: 'Portugais',
  pob: 'Portugais (Brésil)', jpn: 'Japonais', ja: 'Japonais', kor: 'Coréen', ko: 'Coréen', ara: 'Arabe', ar: 'Arabe',
  rus: 'Russe', ru: 'Russe', chi: 'Chinois', zho: 'Chinois', zh: 'Chinois', dut: 'Néerlandais', nld: 'Néerlandais',
  tur: 'Turc', pol: 'Polonais', hin: 'Hindi', swe: 'Suédois', nor: 'Norvégien', dan: 'Danois', fin: 'Finnois',
  gre: 'Grec', ell: 'Grec', heb: 'Hébreu', ron: 'Roumain', rum: 'Roumain', hun: 'Hongrois', cze: 'Tchèque', ces: 'Tchèque',
};

export const langName = (code?: string) => (code ? LANGS[code.toLowerCase()] || code.toUpperCase() : 'Inconnu');

const ALIASES: Record<string, string[]> = {
  fre: ['fre', 'fra', 'fr', 'french', 'français', 'vff', 'vf'],
  eng: ['eng', 'en', 'english', 'anglais'],
  spa: ['spa', 'es', 'spanish', 'español'],
  ger: ['ger', 'deu', 'de', 'german'],
  ita: ['ita', 'it', 'italian'],
};

export function langMatches(code: string | undefined, pref: string): boolean {
  if (!code || !pref) return false;
  const list = ALIASES[pref] || [pref];
  return list.includes(code.toLowerCase());
}
