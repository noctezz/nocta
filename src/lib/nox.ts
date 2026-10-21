// Nox, la mascotte-assistant de NOCTA : discute avec une IA gratuite (Gemini, Groq…) et agit dans l'app grâce à des
// outils (recherche, fiche et casting, vérification de la vraie VF, lecture, liste, langue).
import { create } from 'zustand';
import { getMeta, getStreams, searchableCatalogs, getCatalog, streamQuality, streamSize } from './addons';
import { episodeTarget, nextUnwatched, pickVerified, playTarget, rankStreams } from './autoplay';
import { cachedLang } from './langCheck';
import { langPrefsFor } from './langPrefs';
import { noxKeys } from './noxKeys';
import { speak, stopSpeaking } from './speak';
import { episodeLabel, sortedEpisodes, slimMeta } from './playback';
import { isUhd, fitsLang } from './sourcePolicy';
import { useStore } from './store';
import { resumeEntry } from './ui';
import type { Meta, MetaPreview } from './types';

type Part = Record<string, any>;
type Msg = { role: 'user' | 'model'; parts: Part[] };
type Tool = { name: string; description: string; parameters?: Record<string, unknown> };

// ---------- Ce que Nox sait faire ----------
const TOOLS: Tool[] = [
  {
    name: 'search_titles',
    description: 'Cherche des films ou des séries dans le catalogue de NOCTA à partir d\'un titre (ou d\'un mot-clé). Renvoie les identifiants à utiliser avec les autres outils. Donne le titre corrigé (vraie orthographe, souvent le titre original), pas la transcription approximative de la voix.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Titre ou mots-clés' },
        type: { type: 'string', enum: ['movie', 'series', 'any'], description: 'Film, série, ou les deux' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_title_details',
    description: 'Fiche complète d\'un film ou d\'une série : résumé, année, durée, genres, note IMDb, casting, réalisation, saisons et épisodes, progression de l\'utilisateur. À utiliser pour toute question factuelle (casting, durée…), au lieu de répondre de mémoire.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifiant (ex. tt0133093)' },
        type: { type: 'string', enum: ['movie', 'series'] },
      },
      required: ['id', 'type'],
    },
  },
  {
    name: 'check_language',
    description: 'Vérifie pour de vrai la langue des sources disponibles d\'un film ou d\'un épisode, en lisant les pistes audio des fichiers (pas seulement le nom des torrents). Pour une série sans épisode précisé, vérifie le prochain épisode à regarder. Prend quelques secondes.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string', enum: ['movie', 'series'] },
        season: { type: 'integer' },
        episode: { type: 'integer' },
        want: { type: 'string', enum: ['vf', 'vo'], description: 'Langue à vérifier (par défaut : celle réglée pour ce titre)' },
      },
      required: ['id', 'type'],
    },
  },
  {
    name: 'play',
    description: 'Lance pour de vrai un film, ou un épisode précis d\'une série (sans épisode précisé : reprise ou prochain épisode non vu). NOCTA vérifie lui-même les sources et démarre la première confirmée dans la bonne langue : inutile d\'appeler check_language avant. Seulement quand l\'utilisateur demande de lancer / regarder maintenant.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string', enum: ['movie', 'series'] },
        season: { type: 'integer' },
        episode: { type: 'integer' },
        language: { type: 'string', enum: ['vf', 'vo'], description: 'Seulement si l\'utilisateur précise la langue (« en VF », « en français », « en VO »)' },
      },
      required: ['id', 'type'],
    },
  },
  {
    name: 'open_title',
    description: 'Ouvre la fiche d\'un film ou d\'une série à l\'écran.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, type: { type: 'string', enum: ['movie', 'series'] } },
      required: ['id', 'type'],
    },
  },
  {
    name: 'set_language',
    description: 'Règle la langue d\'un titre précis : VF, ou VO avec sous-titres français. Mémorisé pour ce titre.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, mode: { type: 'string', enum: ['vf', 'vo'] } },
      required: ['id', 'mode'],
    },
  },
  {
    name: 'my_list',
    description: 'Ajoute un titre à « Ma liste » ou l\'en retire.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string', enum: ['movie', 'series'] },
        action: { type: 'string', enum: ['add', 'remove'] },
      },
      required: ['id', 'type', 'action'],
    },
  },
  {
    name: 'get_activity',
    description: 'Ce que l\'utilisateur est en train de regarder (« Reprendre ») et le contenu de « Ma liste ».',
  },
];

const SYSTEM = `Tu es Nox, la mascotte de NOCTA : une petite chouette cinéphile qui vit dans l'application de streaming personnelle de l'utilisateur.

Ta personnalité : chaleureuse, enthousiaste sans en faire trop, un brin d'humour. Tu tutoies. Tu réponds en français, court et clair (2 à 5 phrases, ou une petite liste), comme dans une discussion. Pas de titres markdown ; le **gras** est permis pour les titres d'œuvres.

Comment tu travailles :
- Pour toute info factuelle sur un titre (casting, réalisateur, durée, année, saisons, résumé), utilise get_title_details plutôt que ta mémoire. Si tu ne connais pas l'identifiant, cherche-le avec search_titles.
- « Vérifie la VF », « c'est dispo en français ? », « je vais regarder X » : utilise check_language et dis clairement le résultat (vraie VF trouvée ou non, qualité, et si les noms de torrents mentaient).
- Ne lance une lecture (play) que si l'utilisateur te le demande. Quand il le demande, appelle directement play (avec language s'il précise VF / français / VO) : NOCTA vérifie et démarre tout seul la bonne source, pas besoin de check_language avant. S'il dit juste qu'il va regarder quelque chose, vérifie la VF et propose de lancer.
- Le contexte de l'écran (fiche ouverte, lecture en cours) t'est donné avec chaque message : « ce film », « cette série » désignent la fiche ouverte.
- Pour des recommandations, appuie-toi sur tes connaissances et sur ce que l'utilisateur regarde (get_activity), puis vérifie que les titres existent dans le catalogue avec search_titles.
- N'invente jamais un résultat d'outil. Si un outil échoue, dis-le simplement.
- Les demandes arrivent souvent à la voix : les titres peuvent être mal transcrits ou mal prononcés (« Piki Blender » = Peaky Blinders, « Spaïderman » = Spider-Man, « la casa de papel » = La Casa de Papel, « Brékine Bad » = Breaking Bad). Devine toujours le vrai titre le plus probable (souvent le titre original anglais) et cherche-le directement ; si search_titles ne trouve rien, réessaie avec d'autres orthographes ou le titre original, sans demander à l'utilisateur.
- On peut te parler à voix haute (mode Jarvis) : tes réponses sont alors lues, reste bref et naturel, sans listes longues.
- Pendant un film, on te donne les dialogues des dernières minutes : réponds sur la scène (qui est qui, pourquoi, ce qui vient de se passer) sans JAMAIS révéler la suite.`;

/** Ressemblance entre deux titres (0 à 1), tolérante aux fautes : « piki blender » ≈ « Peaky Blinders » */
function similar(a: string, b: string) {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    .replace(/y/g, 'i').replace(/ph/g, 'f').replace(/k|q/g, 'c').replace(/ee|ea/g, 'i').replace(/(.)\1/g, '$1');
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y || y.includes(x) || x.includes(y)) return 1;
  const grams = (t: string) => { const g = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) g.set(t.slice(i, i + 2), (g.get(t.slice(i, i + 2)) || 0) + 1); return g; };
  const gx = grams(x), gy = grams(y);
  let common = 0;
  gx.forEach((n, k) => { common += Math.min(n, gy.get(k) || 0); });
  return (2 * common) / Math.max(1, x.length - 1 + y.length - 1);
}

// ---------- Exécution des outils ----------
type Input = Record<string, any>;
const profile = () => {
  const st = useStore.getState();
  return st.profiles.find((p) => p.id === st.activeProfileId);
};

function videoFor(meta: Meta, season?: number, episode?: number) {
  if (meta.type !== 'series') return null;
  const eps = sortedEpisodes(meta);
  if (season != null && episode != null) return eps.find((v) => v.season === season && (v.episode ?? v.number) === episode) || null;
  return nextUnwatched(meta, profile()?.watched);
}

async function runTool(name: string, input: Input, onStatus: (text: string) => void): Promise<unknown> {
  const st = useStore.getState();
  switch (name) {
    case 'search_titles': {
      const q = String(input.query || '').trim();
      if (q.length < 2) return { results: [] };
      onStatus(`Recherche de « ${q} »…`);
      const cats = searchableCatalogs(st.addons).filter(({ catalog }) => !input.type || input.type === 'any' || catalog.type === input.type);
      const settled = await Promise.allSettled(cats.map(({ catalog, addon }) => getCatalog(addon, catalog.type, catalog.id, { search: q })));
      const seen = new Set<string>();
      const results: unknown[] = [];
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        for (const m of r.value) {
          if (seen.has(m.id) || results.length >= 8) continue;
          seen.add(m.id);
          results.push({ id: m.id, type: m.type, name: m.name, year: m.releaseInfo, imdb: m.imdbRating });
        }
      }
      // Rien trouvé (titre mal entendu ?) : on cherche parmi ce que l'utilisateur regarde, par ressemblance
      if (!results.length) {
        const p = profile();
        const known = [...Object.values(p?.progress || {}).map((e) => e.meta), ...(p?.myList || [])];
        const close = known.map((m) => ({ m, score: similar(q, m.name || '') })).filter((x) => x.score >= 0.45).sort((a, b) => b.score - a.score);
        for (const { m } of close) if (!seen.has(m.id) && results.length < 5) { seen.add(m.id); results.push({ id: m.id, type: m.type, name: m.name, year: m.releaseInfo, closeMatch: true }); }
        if (!results.length) return { results, hint: 'Aucun résultat : réessaie avec le titre original probable ou une autre orthographe.' };
      }
      return { results };
    }
    case 'get_title_details': {
      onStatus('Lecture de la fiche…');
      const meta = await getMeta(st.addons, input.type, input.id);
      if (!meta) return { error: 'Titre introuvable' };
      const m = meta as Meta & Record<string, any>;
      const castFromLinks = (cat: string) => (m.links || []).filter((l: any) => l.category === cat).map((l: any) => l.name);
      const eps = sortedEpisodes(meta).filter((v) => (v.season ?? 0) > 0);
      const seasons = [...new Set(eps.map((v) => v.season))];
      const p = profile();
      const watched = eps.filter((v) => p?.watched?.[v.id]).length;
      const next = meta.type === 'series' ? nextUnwatched(meta, p?.watched) : null;
      return {
        id: meta.id, type: meta.type, name: meta.name, year: meta.releaseInfo, runtime: m.runtime, genres: meta.genres,
        imdb: meta.imdbRating, description: meta.description,
        cast: (m.cast && m.cast.length ? m.cast : castFromLinks('Cast')).slice(0, 12),
        director: m.director && m.director.length ? m.director : castFromLinks('Directors'),
        writers: m.writer && m.writer.length ? m.writer : castFromLinks('Writers'),
        country: m.country, awards: m.awards,
        seasons: meta.type === 'series' ? seasons.map((s) => ({ season: s, episodes: eps.filter((v) => v.season === s).length })) : undefined,
        user: {
          inMyList: !!p?.myList.some((x) => x.id === meta.id),
          languageMode: langPrefsFor(meta.id).want,
          watchedEpisodes: meta.type === 'series' ? `${watched}/${eps.length}` : undefined,
          movieWatched: meta.type === 'movie' ? !!p?.watched?.[meta.id] : undefined,
          resume: p?.progress[meta.id]?.episodeTitle || (p?.progress[meta.id] ? 'en cours' : undefined),
          nextEpisode: next ? `${episodeLabel(next)} « ${next.title || next.name || ''} »` : undefined,
        },
      };
    }
    case 'check_language': {
      const meta = await getMeta(st.addons, input.type, input.id);
      if (!meta) return { error: 'Titre introuvable' };
      const v = videoFor(meta, input.season, input.episode);
      if (meta.type === 'series' && !v) return { error: 'Épisode introuvable' };
      const videoId = v ? v.id : meta.id;
      const want: 'vf' | 'vo' = input.want || langPrefsFor(meta.id).want || 'vf';
      onStatus(`Recherche des sources${v ? ` (${episodeLabel(v)})` : ''}…`);
      const groups = await getStreams(st.addons, meta.type, videoId);
      const all = groups.flatMap((g) => g.streams.filter((s) => s.url).map((s) => ({ stream: s, addon: g.addon.manifest.name })));
      if (!all.length) return { episode: v ? episodeLabel(v) : undefined, error: 'Aucune source trouvée par les addons' };
      const hide = st.settings.hideUhd !== false;
      const pool = all.filter((r) => !hide || !isUhd(r.stream));
      const tagged = pool.filter((r) => fitsLang(r.stream, want));
      const ranked = rankStreams(tagged.length ? tagged : pool, meta.id).map((r) => r.stream);
      const found = await pickVerified(ranked, want, onStatus, { cancelled: false }, { quiet: true });
      const info = found ? cachedLang(found) : null;
      const checked = ranked.filter((s) => cachedLang(s)).length;
      const fakes = ranked.filter((s) => {
        const c = cachedLang(s);
        return c && (want === 'vf' ? c.status === 'nofr' : c.status === 'fr' && c.vo === false);
      }).length;
      const q = found ? streamQuality(found) : null;
      return {
        episode: v ? `${episodeLabel(v)} « ${v.title || v.name || ''} »` : undefined,
        want,
        confirmed: !!found && (want === 'vf' ? info?.status === 'fr' : info?.vo === true),
        source: found ? { quality: q?.label, size: streamSize(found), addon: all.find((r) => r.stream === found)?.addon, audio: info?.label } : null,
        sourcesWithLanguageTag: tagged.length,
        sourcesChecked: checked,
        fakeLanguageTags: fakes,
      };
    }
    case 'play': {
      const meta = await getMeta(st.addons, input.type, input.id);
      if (!meta) return { error: 'Titre introuvable' };
      // Langue demandée (« en VF », « en VO ») : mémorisée pour ce titre avant de lancer
      const before = langPrefsFor(meta.id).want;
      if (input.language === 'vf' || input.language === 'vo') st.setLangPref(meta.id, input.language);
      const lang = langPrefsFor(meta.id).want || 'vf';
      const langChanged = !!input.language && input.language !== before;
      const p = profile();
      let v = null as ReturnType<typeof videoFor>;
      if (meta.type === 'series') {
        v = videoFor(meta, input.season, input.episode);
        if (!v) return { error: 'Épisode introuvable' };
      }
      // Lecture en cours de ce même film / épisode (et même langue) : reprise directe
      const entry = p?.progress[meta.id];
      if (entry && !langChanged && (!v || entry.videoId === v.id)) {
        resumeEntry(entry);
        setTimeout(() => useNox.getState().setOpen(false), 1500);
        return { resumed: `${meta.name}${v ? ` ${episodeLabel(v)}` : ''}` };
      }
      // Sinon : vérification des sources, et la 1re confirmée dans la bonne langue démarre toute seule
      const target = v ? episodeTarget(meta, v) : { meta: slimMeta(meta), type: meta.type, videoId: meta.id };
      playTarget({ ...target, autoLaunch: true });
      setTimeout(() => useNox.getState().setOpen(false), 1500);
      return { launching: `${meta.name}${v ? ` ${episodeLabel(v)}` : ''}`, language: lang, note: 'Les sources sont vérifiées et la première confirmée dans cette langue démarre toute seule.' };
    }
    case 'open_title': {
      st.openDetail({ type: input.type, id: input.id });
      return { opened: true };
    }
    case 'set_language': {
      st.setLangPref(String(input.id), input.mode === 'vo' ? 'vo' : 'vf');
      return { ok: true, mode: input.mode };
    }
    case 'my_list': {
      const p = profile();
      const inList = !!p?.myList.some((x) => x.id === input.id);
      if ((input.action === 'add') === inList) return { ok: true, unchanged: true };
      const meta = await getMeta(st.addons, input.type, input.id);
      if (!meta) return { error: 'Titre introuvable' };
      st.toggleMyList(meta as MetaPreview);
      return { ok: true };
    }
    case 'get_activity': {
      const p = profile();
      return {
        continueWatching: Object.values(p?.progress || {}).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10)
          .map((e) => ({ id: e.meta.id, type: e.meta.type, name: e.meta.name, episode: e.episodeTitle, progress: e.duration ? Math.round((e.position / e.duration) * 100) + '%' : undefined })),
        myList: (p?.myList || []).slice(0, 20).map((m) => ({ id: m.id, type: m.type, name: m.name })),
      };
    }
  }
  return { error: `Outil inconnu : ${name}` };
}

/** Ce qui est à l'écran, envoyé avec chaque question */
function screenContext(): string {
  const st = useStore.getState();
  const parts = [`Page : ${st.page}`];
  if (st.detail) parts.push(`Fiche ouverte : ${st.detail.preview?.name || ''} (id ${st.detail.id}, ${st.detail.type})`);
  if (st.player) parts.push(`En lecture : ${st.player.title}${st.player.subtitle ? ` ${st.player.subtitle}` : ''}${st.player.meta ? ` (id ${st.player.meta.id})` : ''}`);
  const p = profile();
  if (p) parts.push(`Profil : ${p.name}`);
  return `[Contexte de l'écran — ${parts.join(' · ')}]`;
}

// ---------- Conversation ----------
export interface ChatItem {
  id: number;
  role: 'user' | 'nox' | 'activity' | 'error';
  text: string;
}

interface NoxState {
  open: boolean;
  busy: boolean;
  /** Début de la réflexion en cours (pour afficher le temps écoulé) */
  since: number;
  /** Service qui a répondu en dernier (Gemini, Groq…) */
  via: string;
  items: ChatItem[];
  history: Msg[];
  setOpen: (v: boolean) => void;
  reset: () => void;
  /** Interrompt la réponse en cours */
  stop: () => void;
  /** byVoice : question posée au micro (Nox répond alors à voix haute si c'est réglé ainsi) */
  ask: (text: string, opts?: { byVoice?: boolean; context?: string }) => Promise<void>;
}

let seq = 0;
let run = 0; // chaque question a son numéro : une réponse arrivée après « Stop » est ignorée

/**
 * Seules les 6 dernières questions (et leurs réponses) sont envoyées : les quotas gratuits se
 * comptent en mots envoyés par minute, et une longue discussion les épuiserait vite.
 */
function recent(history: Msg[], keep = 6): Msg[] {
  const starts = history.map((m, i) => (m.role === 'user' && m.parts.some((p) => typeof p.text === 'string') && !m.parts.some((p) => p.functionResponse) ? i : -1)).filter((i) => i >= 0);
  return starts.length > keep ? history.slice(starts[starts.length - keep]) : history;
}

/** Appel à Gemini avec filet de sécurité : jamais d'attente infinie */
function call(req: Parameters<NonNullable<typeof window.nocta>['assistant']['create']>[0]) {
  return Promise.race([
    window.nocta!.assistant.create(req),
    new Promise<{ ok: false; error: string }>((r) => setTimeout(() => r({ ok: false, error: 'Personne ne répond : réessaie dans un instant.' }), 130000)),
  ]);
}
const ACT: Record<string, string> = {
  search_titles: '🔎', get_title_details: '🎬', check_language: '🇫🇷', play: '▶️', open_title: '📄', set_language: '🗣️', my_list: '➕', get_activity: '🕘',
};

export const useNox = create<NoxState>((set, get) => ({
  open: false,
  busy: false,
  since: 0,
  via: '',
  items: [],
  history: [],
  setOpen: (open) => set({ open }),
  reset: () => { run++; stopSpeaking(); set({ items: [], history: [], busy: false }); },
  stop: () => {
    stopSpeaking();
    if (!get().busy) return;
    run++;
    set((s) => ({ busy: false, items: [...s.items, { id: ++seq, role: 'activity', text: '⏹️ Arrêté' }] }));
  },
  ask: async (text, opts = {}) => {
    const q = text.trim();
    if (!q || get().busy) return;
    const keys = noxKeys(useStore.getState().settings);
    const push = (role: ChatItem['role'], t: string) => {
      const item = { id: ++seq, role, text: t };
      set((s) => ({ items: [...s.items, item] }));
      return item.id;
    };
    const update = (id: number, t: string) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, text: t } : i)) }));
    stopSpeaking();
    push('user', q);
    const me = ++run;
    set({ busy: true, since: Date.now() });
    // Historique en ajout seul : jamais réécrit (les blocs de réflexion doivent revenir intacts)
    const history: Msg[] = [...get().history];
    const asked: Part = { text: `${screenContext()}${opts.context ? `\n${opts.context}` : ''}\n\n${q}` };
    // Après une erreur, le dernier message peut déjà venir de l'utilisateur : on le complète
    const last = history[history.length - 1];
    if (last?.role === 'user') history[history.length - 1] = { role: 'user', parts: [...last.parts, asked] };
    else history.push({ role: 'user', parts: [asked] });
    try {
      for (let turn = 0; turn < 8; turn++) {
        const res = await call({ keys, system: SYSTEM, tools: TOOLS, contents: recent(history) });
        if (me !== run) return; // arrêté entre-temps : historique laissé tel qu'avant la question
        if (res.ok && res.via) set({ via: res.via });
        if (!res.ok || !res.content) { push('error', res.error || 'Pas de réponse'); break; }
        // Remis tel quel (signatures de réflexion comprises), sinon Gemini perd le fil des outils
        const parts: Part[] = res.content.parts || [];
        history.push({ role: 'model', parts });
        const said = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
        if (said) {
          push('nox', said);
          const voice = useStore.getState().settings.noxVoice || 'mic';
          if (voice === 'always' || (voice === 'mic' && opts.byVoice)) speak(said);
        }
        const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall as { name: string; args?: Input; id?: string });
        if (!calls.length) {
          if (!said) push('nox', /SAFETY|BLOCK|PROHIBITED/.test(res.finishReason || '') ? 'Désolé, je ne peux pas t\'aider là-dessus.' : 'Hmm, je n\'ai rien trouvé à répondre. Tu peux reformuler ?');
          break;
        }
        // Outils demandés : exécutés, puis tous les résultats renvoyés dans un seul message
        const results: Part[] = [];
        for (const call of calls) {
          const actId = push('activity', `${ACT[call.name] || '⚙️'} …`);
          const status = (t: string) => update(actId, `${ACT[call.name] || '⚙️'} ${t}`);
          status(call.name === 'check_language' ? 'Vérification de la langue…' : 'Un instant…');
          let out: unknown;
          try {
            out = await runTool(call.name, call.args || {}, status);
            const err = out && typeof out === 'object' && 'error' in out ? String((out as { error: unknown }).error) : null;
            status(err ? `Oups : ${err}` : doneLabel(call.name, call.args || {}, out));
          } catch (e) {
            status('Oups, ça n\'a pas marché');
            out = { error: String((e as Error).message || e) };
          }
          if (me !== run) return;
          results.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result: out } } });
        }
        history.push({ role: 'user', parts: results });
      }
    } catch (e) {
      if (me === run) push('error', String((e as Error)?.message || e));
    } finally {
      if (me === run) set({ history, busy: false });
    }
  },
}));

function doneLabel(name: string, input: Input, out: any): string {
  switch (name) {
    case 'search_titles': return `Recherche « ${input.query} » : ${out?.results?.length || 0} résultat(s)`;
    case 'get_title_details': return `Fiche de ${out?.name || 'ce titre'}`;
    case 'check_language': return out?.confirmed ? `${out.want === 'vo' ? 'VO' : 'Vraie VF'} trouvée${out.source?.quality ? ` · ${out.source.quality}` : ''}` : `Pas de ${out?.want === 'vo' ? 'VO' : 'vraie VF'} confirmée`;
    case 'play': return out?.resumed ? `Reprise de ${out.resumed}` : `Lancement de ${out?.launching || 'la vidéo'} en ${out?.language === 'vo' ? 'VO' : 'VF'}`;
    case 'open_title': return 'Fiche ouverte';
    case 'set_language': return `Langue réglée : ${input.mode === 'vo' ? 'VO · sous-titres FR' : 'VF'}`;
    case 'my_list': return input.action === 'add' ? 'Ajouté à ta liste' : 'Retiré de ta liste';
    case 'get_activity': return 'Ce que tu regardes';
  }
  return 'Fait';
}
