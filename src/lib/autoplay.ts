import { getMeta, getStreams, streamQuality } from './addons';
import { errMsg, nextEpisode, resolveStream, slimMeta, sortedEpisodes, episodeTitleOf, streamToDesc } from './playback';
import { useStore } from './store';
import { useBusy } from './ui';
import type { Meta, MetaPreview, PlayRequest, Settings, Stream, Video } from './types';

/** Ce qu'on veut regarder : un film, ou un épisode précis */
export interface PlayTarget {
  meta: MetaPreview;
  type: string;
  videoId: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

/** Lien débrid déjà en cache (lecture instantanée) */
export const isInstant = (s: Stream) => !!s.url && /⚡|\+\]|cached|instant/i.test(`${s.name} ${s.title}`);

/**
 * Note une source selon les préférences : lien direct, en cache, langue, résolution.
 * Plus le score est haut, meilleure est la source.
 */
export function scoreStream(s: Stream, prefs: Pick<Settings, 'maxResolution' | 'preferFrench'>): number {
  const q = streamQuality(s);
  let score = 0;
  if (s.url) score += 1_000_000;
  if (isInstant(s)) score += 100_000;
  if (prefs.preferFrench) {
    // MULTI contient presque toujours la piste française : même priorité que VF
    if (q.tags.includes('VF') || q.tags.includes('MULTI')) score += 30_000;
    else if (q.tags.includes('VOSTFR')) score += 5_000;
  }
  const max = prefs.maxResolution || 1080;
  const res = q.res || 720;
  // Au plus proche de la résolution voulue, sans la dépasser de préférence
  score += res <= max ? res * 10 : max * 10 - (res - max) * 5;
  // Dolby Vision seul (sans HDR10) s'affiche mal sur beaucoup d'écrans PC
  if (q.tags.includes('Dolby Vision') && !/hdr/i.test(`${s.name} ${s.title}`)) score -= 3_000;
  return score;
}

export function rankStreams<T extends { stream: Stream }>(rows: T[]): T[] {
  const prefs = useStore.getState().settings;
  return rows.slice().sort((a, b) => scoreStream(b.stream, prefs) - scoreStream(a.stream, prefs));
}

/**
 * Lance un film ou un épisode. Avec le choix auto (par défaut), la meilleure source
 * démarre directement ; sinon (ou si rien ne convient) la liste des sources s'ouvre.
 */
export async function playTarget(t: PlayTarget, opts: { manual?: boolean; startAt?: number } = {}) {
  const st = useStore.getState();
  if (opts.manual || !st.settings.autoPickSource) {
    st.openPicker(t);
    return;
  }
  const busy = useBusy.getState();
  const signal = { cancelled: false };
  const base = { meta: t.meta, title: t.meta.name, subtitle: t.episodeTitle };
  busy.set({ ...base, status: 'Recherche de la meilleure source…' }, signal);
  try {
    const groups = await getStreams(st.addons, t.type, t.videoId);
    if (signal.cancelled) return;
    const rows = groups.flatMap((g) => g.streams.filter((s) => s.url).map((stream) => ({ stream })));
    const best = rankStreams(rows)[0]?.stream;
    if (!best) {
      busy.set(null, null);
      st.openPicker(t);
      if (groups.length) st.toast('Aucune source directe trouvée : choisis-en une dans la liste');
      return;
    }
    const q = streamQuality(best);
    busy.set({ ...base, status: `Lancement · ${[q.label, ...q.tags.slice(0, 2)].filter(Boolean).join(' · ') || 'meilleure source'}` });
    const desc = streamToDesc(best);
    const src = await resolveStream(desc, { season: t.season, episode: t.episode }, undefined, signal);
    if (signal.cancelled) return;
    useStore.getState().closeDetail();
    useStore.getState().play({
      src, title: t.meta.name, subtitle: t.episodeTitle, meta: t.meta, type: t.type,
      videoId: t.videoId, season: t.season, episode: t.episode, stream: desc, startAt: opts.startAt,
    });
  } catch (e) {
    if (!signal.cancelled) {
      busy.set(null, null);
      st.toast(errMsg(e), 'error');
      st.openPicker(t);
    }
  }
}

export function episodeTarget(meta: Meta | MetaPreview, v: Video): PlayTarget {
  return {
    meta: slimMeta(meta), type: meta.type || 'series', videoId: v.id, season: v.season,
    episode: v.episode ?? v.number, episodeTitle: episodeTitleOf(v),
  };
}

/**
 * Prochain épisode à regarder : celui qui suit le dernier épisode vu,
 * sinon le premier non vu, sinon le tout premier.
 */
export function nextUnwatched(meta: Meta, watched: Record<string, number> | undefined): Video | null {
  const eps = sortedEpisodes(meta).filter((v) => v.season! > 0);
  const all = eps.length ? eps : sortedEpisodes(meta);
  if (!all.length) return null;
  const w = watched || {};
  let lastIdx = -1;
  all.forEach((v, i) => { if (w[v.id]) lastIdx = i; });
  if (lastIdx >= 0 && lastIdx < all.length - 1) return all[lastIdx + 1];
  return all.find((v) => !w[v.id]) || all[0];
}

/** « Reprendre » : épisode suivant sans position → lancement direct de cet épisode */
export async function playNextFor(metaPreview: MetaPreview, videoId: string) {
  const st = useStore.getState();
  const meta = await getMeta(st.addons, metaPreview.type, metaPreview.id);
  const v = meta?.videos?.find((x) => x.id === videoId);
  if (!meta || !v) return st.openDetail({ type: metaPreview.type, id: metaPreview.id, preview: metaPreview });
  return playTarget(episodeTarget(meta, v));
}

export { nextEpisode };

/** URL lisible de la meilleure source d'un épisode (même « bingeGroup » si possible), sans rien lancer */
export async function bestSourceUrl(type: string, videoId: string, bingeGroup?: string): Promise<string | null> {
  const groups = await getStreams(useStore.getState().addons, type, videoId);
  const all = groups.flatMap((g) => g.streams).filter((s) => s.url);
  const same = bingeGroup ? all.find((s) => s.behaviorHints?.bingeGroup === bingeGroup) : undefined;
  const best = same || rankStreams(all.map((stream) => ({ stream })))[0]?.stream;
  return best?.url || null;
}

/**
 * Détecte le générique de l'épisode en cours en comparant son audio à celui d'un épisode voisin.
 * Les plages trouvées sont mémorisées par épisode (le suivant est donc prêt d'avance).
 */
export async function detectIntro(req: PlayRequest, meta: Meta | null, onFound: (mark: { start: number; end: number }) => void) {
  const st = useStore.getState();
  if (!window.nocta?.intro || !st.settings.introDetection) return;
  if (req.type !== 'series' || !req.meta || !req.videoId || !meta) return;
  const seriesId = req.meta.id;
  const known = st.introMarks?.[req.videoId];
  if (known) return onFound(known);

  const eps = sortedEpisodes(meta).filter((v) => v.season! > 0);
  const i = eps.findIndex((v) => v.id === req.videoId);
  const neighbor = eps[i + 1] || eps[i - 1];
  let b: { id: string; src?: string } | undefined;
  if (neighbor) {
    b = { id: neighbor.id };
    if (!(await window.nocta.intro.has(seriesId, neighbor.id))) {
      b.src = (await bestSourceUrl('series', neighbor.id, req.stream?.bingeGroup).catch(() => null)) || undefined;
    }
  }
  const src = req.stream?.localPath || req.src;
  const found = await window.nocta.intro.detect({ seriesId, a: { id: req.videoId, src }, b });
  const marks = { ...(useStore.getState().introMarks || {}) };
  for (const [id, m] of Object.entries(found)) marks[id] = m;
  useStore.setState({ introMarks: marks });
  if (found[req.videoId]) onFound(found[req.videoId]);
}
