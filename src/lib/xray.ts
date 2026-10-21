// X-Ray : qui est à l'écran, qui joue qui, ce qui vient de se passer.
// - Distribution : TMDB (photos, personnages, invités de l'épisode) si une clé est réglée,
//   sinon le casting de la fiche + photos et biographies de Wikipédia.
// - « Dans cette scène » : Nox lit les dialogues autour du moment présent (sous-titres) et en
//   déduit les personnages présents (qui parle, qui est nommé, ce qui se passe).
// - Rattrapage et anecdotes, toujours sans rien révéler de la suite.
import { getSubtitles } from './addons';
import { noxKeys } from './noxKeys';
import { parseVtt } from './subs';
import { useStore } from './store';
import type { Meta } from './types';

export interface XPerson {
  id: string;
  actor: string;
  character?: string;
  photo?: string;
  tmdbId?: number;
  /** Invité de cet épisode (pas un personnage récurrent) */
  guest?: boolean;
}
export interface XScene { ids: string[]; moment?: string; reasons: Record<string, string>; noSubs?: boolean }
export interface XPersonDetails {
  bio?: string;
  born?: string;
  place?: string;
  knownFor: { title: string; year?: string; poster?: string; character?: string }[];
}

export interface XContext {
  meta: Meta;
  type: string;
  videoId: string;
  season?: number;
  episode?: number;
  subtitle?: string;
}

const http = (url: string, headers?: Record<string, string>) => window.nocta!.http(url, { headers, timeout: 15000 });
const IMG = 'https://image.tmdb.org/t/p/';

// ---------- TMDB ----------
const tmdbKey = () => (useStore.getState().settings.tmdbKey || '').trim();
async function tmdb(path: string, params: Record<string, string> = {}) {
  const key = tmdbKey();
  const q = new URLSearchParams(params);
  // Clé v3 (32 caractères) ou jeton v4 (long)
  const bearer = key.length > 40;
  if (!bearer) q.set('api_key', key);
  const r = await http(`https://api.themoviedb.org/3${path}?${q}`, bearer ? { Authorization: `Bearer ${key}` } : undefined);
  if (!r.ok || typeof r.data !== 'object') throw new Error(r.status === 401 ? 'Clé TMDB refusée' : `TMDB ${r.status || 'injoignable'}`);
  return r.data as any;
}

/** Vérifie une clé TMDB (Paramètres) */
export async function testTmdb(key: string): Promise<boolean> {
  const bearer = key.length > 40;
  const r = await http(`https://api.themoviedb.org/3/configuration${bearer ? '' : `?api_key=${encodeURIComponent(key)}`}`, bearer ? { Authorization: `Bearer ${key}` } : undefined);
  return r.ok;
}

const tmdbIds = new Map<string, { id: number; kind: 'tv' | 'movie' } | null>();
async function tmdbIdOf(imdb: string) {
  if (tmdbIds.has(imdb)) return tmdbIds.get(imdb)!;
  const d = await tmdb(`/find/${imdb}`, { external_source: 'imdb_id' });
  const hit = d.tv_results?.[0] ? { id: d.tv_results[0].id, kind: 'tv' as const } : d.movie_results?.[0] ? { id: d.movie_results[0].id, kind: 'movie' as const } : null;
  tmdbIds.set(imdb, hit);
  return hit;
}

async function tmdbCast(ctx: XContext): Promise<XPerson[] | null> {
  const imdb = /^tt\d+/.exec(ctx.meta.id)?.[0];
  if (!tmdbKey() || !imdb) return null;
  const t = await tmdbIdOf(imdb);
  if (!t) return null;
  const map = (c: any, guest = false): XPerson => ({
    id: `tmdb:${c.id}`, tmdbId: c.id, actor: c.name, character: c.character || c.roles?.[0]?.character || undefined,
    photo: c.profile_path ? `${IMG}w185${c.profile_path}` : undefined, guest,
  });
  if (t.kind === 'tv' && ctx.season != null && ctx.episode != null) {
    const d = await tmdb(`/tv/${t.id}/season/${ctx.season}/episode/${ctx.episode}/credits`, { language: 'fr-FR' }).catch(() => null);
    if (d) {
      const out = [...(d.cast || []).map((c: any) => map(c)), ...(d.guest_stars || []).map((c: any) => map(c, true))];
      if (out.length) return dedupe(out);
    }
    const agg = await tmdb(`/tv/${t.id}/aggregate_credits`, { language: 'fr-FR' });
    return dedupe((agg.cast || []).slice(0, 40).map((c: any) => map(c)));
  }
  const d = await tmdb(`/${t.kind}/${t.id}/credits`, { language: 'fr-FR' });
  return dedupe((d.cast || []).slice(0, 40).map((c: any) => map(c)));
}

const dedupe = (list: XPerson[]) => {
  const seen = new Set<string>();
  return list.filter((p) => !seen.has(p.id) && seen.add(p.id));
};

// ---------- Sans TMDB : fiche + Wikipédia + Nox pour les personnages ----------
async function wiki(name: string): Promise<{ photo?: string; extract?: string; description?: string } | null> {
  for (const lang of ['fr', 'en']) {
    const r = await http(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`).catch(() => null);
    const d = r?.ok ? r.data : null;
    if (d && typeof d === 'object' && d.type !== 'disambiguation') {
      return { photo: d.thumbnail?.source, extract: d.extract, description: d.description };
    }
  }
  return null;
}

/** Réponse JSON de Nox (texte libre nettoyé), null si rien d'exploitable */
async function askJson<T>(prompt: string, system = 'Tu es un expert cinéma et séries. Réponds uniquement par du JSON valide, sans texte autour.'): Promise<T | null> {
  const keys = noxKeys(useStore.getState().settings);
  if (!keys.length) return null;
  const r = await window.nocta!.assistant.create({ keys, system, tools: [], contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  if (!r.ok || !r.content) return null;
  const text = r.content.parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('');
  const m = /[[{][\s\S]*[\]}]/.exec(text.replace(/```(?:json)?/g, ''));
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

async function askText(prompt: string): Promise<string | null> {
  const keys = noxKeys(useStore.getState().settings);
  if (!keys.length) return null;
  const r = await window.nocta!.assistant.create({
    keys,
    system: 'Tu es Nox, la chouette cinéphile de NOCTA. Tu réponds en français, de façon claire et vivante, sans titres markdown. Tu ne révèles JAMAIS ce qui se passe après le moment indiqué.',
    tools: [],
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  if (!r.ok || !r.content) return null;
  return r.content.parts.filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim() || null;
}

function castNames(meta: Meta): string[] {
  const m = meta as Meta & Record<string, any>;
  const fromLinks = (m.links || []).filter((l: any) => l.category === 'Cast').map((l: any) => l.name);
  return ((m.cast && m.cast.length ? m.cast : fromLinks) as string[]).slice(0, 14);
}

async function fallbackCast(ctx: XContext): Promise<XPerson[]> {
  const names = castNames(ctx.meta);
  const year = ctx.meta.releaseInfo ? ` (${String(ctx.meta.releaseInfo).slice(0, 4)})` : '';
  const [roles, pics] = await Promise.all([
    names.length ? askJson<Record<string, string>>(`Dans « ${ctx.meta.name} »${year}, quel personnage joue chacun de ces acteurs ? Donne le nom du personnage tel qu'il est connu en France. JSON : {"Nom de l'acteur": "Personnage"}. Acteurs : ${names.join(', ')}`).catch(() => null) : null,
    Promise.all(names.map((n) => wiki(n).catch(() => null))),
  ]);
  return names.map((n, i) => ({ id: `name:${n}`, actor: n, character: roles?.[n] || undefined, photo: pics[i]?.photo }));
}

// ---------- Sous-titres (pour comprendre la scène) ----------
interface Line { t: number; text: string }
const subsCache = new Map<string, Promise<Line[] | null>>();

function loadLines(ctx: XContext): Promise<Line[] | null> {
  if (subsCache.has(ctx.videoId)) return subsCache.get(ctx.videoId)!;
  const job = (async () => {
    const st = useStore.getState();
    const tracks = await getSubtitles(st.addons, ctx.type, ctx.videoId).catch(() => []);
    const pick = tracks.filter((t) => /^(fr|fre|fra)/i.test(t.lang)).concat(tracks.filter((t) => /^(en|eng)/i.test(t.lang)));
    const port = await window.nocta!.media.port();
    for (const t of pick.slice(0, 3)) {
      const text = await fetch(`http://127.0.0.1:${port}/subs?src=${encodeURIComponent(t.url)}`).then((r) => r.text()).catch(() => '');
      const cues = parseVtt(text);
      if (cues.length > 50) {
        return cues.map((c) => ({ t: c.start, text: c.html.replace(/<br\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() })).filter((l) => l.text);
      }
    }
    return null;
  })();
  subsCache.set(ctx.videoId, job);
  job.then((r) => { if (!r) subsCache.delete(ctx.videoId); }, () => subsCache.delete(ctx.videoId));
  return job;
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const label = (ctx: XContext) => `« ${ctx.meta.name} »${ctx.subtitle ? `, ${ctx.subtitle}` : ''}`;

/** Dialogues entre deux instants, raccourcis pour tenir dans un message */
function dialogue(lines: Line[], from: number, to: number, maxChars: number) {
  let sel = lines.filter((l) => l.t >= from && l.t <= to);
  let out = sel.map((l) => `[${mmss(l.t)}] ${l.text}`).join('\n');
  // Trop long : on garde une réplique sur deux, puis une sur trois… (le fil reste compréhensible)
  for (let step = 2; out.length > maxChars && step < 12; step++) {
    sel = lines.filter((l, i) => l.t >= from && l.t <= to && (i % step === 0 || l.t > to - 120));
    out = sel.map((l) => `[${mmss(l.t)}] ${l.text}`).join('\n');
  }
  return out.slice(-maxChars);
}

// ---------- API ----------
const castCache = new Map<string, Promise<XPerson[]>>();

/** Distribution de la vidéo en cours (épisode précis pour une série) */
export function getCast(ctx: XContext): Promise<XPerson[]> {
  const key = `${ctx.videoId}|${tmdbKey() ? 'tmdb' : 'wiki'}`;
  if (castCache.has(key)) return castCache.get(key)!;
  const job = (async () => (await tmdbCast(ctx).catch(() => null)) || fallbackCast(ctx))();
  castCache.set(key, job);
  job.catch(() => castCache.delete(key));
  return job;
}

/** Personnages présents dans la scène en cours (d'après les dialogues autour de cet instant) */
export async function getScene(ctx: XContext, time: number, cast: XPerson[]): Promise<XScene> {
  const lines = await loadLines(ctx);
  if (!lines) return { ids: [], reasons: {}, noSubs: true };
  const near = dialogue(lines, Math.max(0, time - 150), time + 4, 3500);
  const before = dialogue(lines, Math.max(0, time - 600), Math.max(0, time - 150), 2500);
  const people = cast.slice(0, 30).map((p) => `${p.actor} — ${p.character || '?'}`).join('\n');
  const res = await askJson<{ scene?: { character?: string; actor?: string; reason?: string }[]; moment?: string }>(
    `${label(ctx)}, à ${mmss(time)}.\n\nDistribution (acteur — personnage) :\n${people}\n\n` +
    `Contexte (dialogues un peu avant) :\n${before || '(rien)'}\n\nDialogues de la scène en cours (jusqu'à ${mmss(time)}) :\n${near || '(aucun dialogue)'}\n\n` +
    'Quels personnages de la distribution sont présents dans la scène EN COURS à cet instant ? Appuie-toi sur qui parle, qui est interpellé ou nommé, ' +
    'le fil de la conversation et ta connaissance de l\'œuvre. Maximum 6, du plus sûr au moins sûr ; n\'invente pas. ' +
    'Ajoute « moment » : une phrase courte qui décrit la scène, sans rien révéler de la suite. ' +
    'JSON : {"scene":[{"character":"…","actor":"…","reason":"en quelques mots"}],"moment":"…"}',
  ).catch(() => null);
  const norm = (s?: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim();
  const ids: string[] = [];
  const reasons: Record<string, string> = {};
  for (const s of res?.scene || []) {
    const c = norm(s.character), a = norm(s.actor);
    const hit = cast.find((p) => (a && norm(p.actor) === a))
      || cast.find((p) => c && norm(p.character) === c)
      || cast.find((p) => {
        // « Hughie » ↔ « Hughie Campbell » : on compare les mots significatifs (pas « le », « la »…)
        const pc = norm(p.character);
        if (!c || !pc) return false;
        const words = (x: string) => x.split(' ').filter((w) => w.length >= 4);
        return pc.includes(c) || words(c).some((w) => words(pc).includes(w));
      });
    if (hit && !ids.includes(hit.id)) { ids.push(hit.id); if (s.reason) reasons[hit.id] = s.reason; }
  }
  return { ids: ids.slice(0, 6), moment: res?.moment, reasons };
}

/** Fiche d'un acteur : biographie, naissance, autres rôles */
const personCache = new Map<string, Promise<XPersonDetails>>();
export function getPerson(p: XPerson): Promise<XPersonDetails> {
  if (personCache.has(p.id)) return personCache.get(p.id)!;
  const job = (async (): Promise<XPersonDetails> => {
    if (p.tmdbId && tmdbKey()) {
      const [fr, credits] = await Promise.all([
        tmdb(`/person/${p.tmdbId}`, { language: 'fr-FR' }),
        tmdb(`/person/${p.tmdbId}/combined_credits`, { language: 'fr-FR' }).catch(() => ({ cast: [] })),
      ]);
      const en = fr.biography ? null : await tmdb(`/person/${p.tmdbId}`, { language: 'en-US' }).catch(() => null);
      const seen = new Set<string>();
      const knownFor = (credits.cast || [])
        .filter((c: any) => c.poster_path && (c.vote_count || 0) > 50 && !/talk|news|reality/i.test(String(c.genre_ids)))
        .sort((a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0))
        .filter((c: any) => { const k = c.title || c.name; return !seen.has(k) && seen.add(k); })
        .slice(0, 12)
        .map((c: any) => ({ title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4), poster: `${IMG}w185${c.poster_path}`, character: c.character }));
      return { bio: fr.biography || en?.biography || undefined, born: fr.birthday || undefined, place: fr.place_of_birth || undefined, knownFor };
    }
    const w = await wiki(p.actor);
    return { bio: w?.extract, knownFor: [] };
  })();
  personCache.set(p.id, job);
  job.catch(() => personCache.delete(p.id));
  return job;
}

/** Dialogues des dernières minutes de la vidéo en cours (pour répondre à une question pendant le film) */
export async function sceneDialogue(ctx: { type: string; videoId: string }, time: number): Promise<string | null> {
  const lines = await loadLines(ctx as XContext);
  if (!lines) return null;
  return dialogue(lines, Math.max(0, time - 180), time + 2, 4000) || null;
}

/** Rattrapage : ce qui vient de se passer (5 dernières minutes) ou depuis le début */
export async function getRecap(ctx: XContext, time: number, range: 'recent' | 'all'): Promise<string> {
  const lines = await loadLines(ctx);
  if (!lines) {
    const t = range === 'all'
      ? await askText(`Résume le début de ${label(ctx)} jusqu'à environ ${mmss(time)}, en 5 à 8 phrases, sans rien révéler de la suite. Si tu ne connais pas assez bien cet épisode, dis-le simplement.`)
      : null;
    return t || 'Pas de sous-titres disponibles pour cette vidéo : impossible de savoir ce qui vient de se passer.';
  }
  const from = range === 'recent' ? Math.max(0, time - 330) : 0;
  const text = dialogue(lines, from, time, range === 'recent' ? 5000 : 14000);
  const out = await askText(
    `${label(ctx)}. Voici les dialogues ${range === 'recent' ? 'des 5 dernières minutes' : 'depuis le début'}, jusqu'à ${mmss(time)} :\n${text}\n\n` +
    (range === 'recent'
      ? 'Raconte en 3 à 5 phrases ce qui vient de se passer, comme à un ami qui a décroché un instant : qui, quoi, pourquoi c\'est important.'
      : 'Fais un résumé clair de tout ce qui s\'est passé jusqu\'ici, en 6 à 10 phrases ou une petite liste, avec les noms des personnages.') +
    ' Rien sur la suite.',
  );
  return out || 'Nox n\'a pas pu faire le résumé pour le moment (clé IA saturée ?). Réessaie dans un instant.';
}

/** Anecdotes (tournage, casting, coulisses) sans divulgâcher */
export async function getTrivia(ctx: XContext): Promise<string[]> {
  const res = await askJson<{ facts?: string[] }>(
    `Donne 4 anecdotes vraies et vérifiables sur ${label(ctx)} (tournage, casting, coulisses, références). ` +
    'Uniquement des faits dont tu es sûr : mieux vaut 2 anecdotes justes que 4 douteuses. Aucune révélation sur l\'intrigue après ce moment. ' +
    'Une ou deux phrases chacune, en français. JSON : {"facts":["…"]}',
  ).catch(() => null);
  return (res?.facts || []).filter((f) => typeof f === 'string' && f.length > 10).slice(0, 4);
}
