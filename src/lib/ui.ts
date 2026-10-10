import { create } from 'zustand';
import { useStore } from './store';
import { errMsg, resolveStream } from './playback';
import type { MetaPreview, ProgressEntry } from './types';
import type { LoadingInfo } from '../components/LoadingScreen';

export const isImdb = (id: string) => /^tt\d+/.test(id);

export function backdropOf(m: MetaPreview): string | undefined {
  if (m.background) return m.background;
  if (isImdb(m.id)) return `https://images.metahub.space/background/medium/${m.id.split(':')[0]}/img`;
  return m.poster;
}

export function logoOf(m: MetaPreview): string | undefined {
  if (m.logo) return m.logo;
  if (isImdb(m.id)) return `https://images.metahub.space/logo/medium/${m.id.split(':')[0]}/img`;
  return undefined;
}

export function posterOf(m: MetaPreview): string | undefined {
  if (m.poster) return m.poster;
  if (isImdb(m.id)) return `https://images.metahub.space/poster/medium/${m.id.split(':')[0]}/img`;
  return undefined;
}

export function year(m: MetaPreview) {
  return (m.releaseInfo || '').slice(0, 9);
}

// ---------- Aperçu au survol (popup façon Netflix) ----------

export type CardVariant = 'landscape' | 'top10' | 'continue';

interface HoverState {
  item: MetaPreview | null;
  rect: DOMRect | null;
  entry?: ProgressEntry;
  show: (item: MetaPreview, rect: DOMRect, entry?: ProgressEntry) => void;
  hide: () => void;
}

export const useHover = create<HoverState>((set) => ({
  item: null,
  rect: null,
  show: (item, rect, entry) => set({ item, rect, entry }),
  hide: () => set({ item: null, rect: null, entry: undefined }),
}));

// ---------- Chargement plein écran (préparation, reprise) ----------

interface BusyState {
  busy: LoadingInfo | null;
  cancel: { cancelled: boolean } | null;
  set: (b: BusyState['busy'], cancel?: BusyState['cancel']) => void;
}

export const useBusy = create<BusyState>((set) => ({
  busy: null,
  cancel: null,
  set: (busy, cancel) => set((s) => ({ busy, cancel: cancel === undefined ? s.cancel : cancel })),
}));

/** Reprend une lecture depuis "Reprendre" */
export async function resumeEntry(entry: ProgressEntry) {
  const st = useStore.getState();
  if (!entry.stream) {
    st.openDetail({ type: entry.meta.type, id: entry.meta.id, preview: entry.meta });
    return;
  }
  const signal = { cancelled: false };
  const busy = useBusy.getState();
  const base = { meta: entry.meta, title: entry.meta.name, subtitle: entry.episodeTitle };
  busy.set({ ...base, status: 'Reprise de la lecture…' }, signal);
  try {
    const src = await resolveStream(entry.stream, { season: entry.season, episode: entry.episode }, (u) =>
      busy.set({ ...base, status: 'Préparation du fichier…', progress: u.progress }),
    signal);
    if (signal.cancelled) return;
    st.play({
      src,
      title: entry.meta.name,
      subtitle: entry.episodeTitle,
      meta: entry.meta,
      type: entry.meta.type,
      videoId: entry.videoId,
      season: entry.season,
      episode: entry.episode,
      stream: entry.stream,
      startAt: entry.position,
    });
  } catch (e) {
    if (!signal.cancelled) {
      st.toast(`Impossible de reprendre : ${errMsg(e)}`, 'error');
      st.openDetail({ type: entry.meta.type, id: entry.meta.id, preview: entry.meta });
    }
  } finally {
    useBusy.getState().set(null, null);
  }
}

/** Bouton lecture d'une vignette : reprise si possible, sinon choix de la source */
export function quickPlay(m: MetaPreview) {
  const st = useStore.getState();
  const profile = st.profiles.find((p) => p.id === st.activeProfileId);
  const entry = profile?.progress[m.id];
  if (entry) return resumeEntry(entry);
  if (m.type === 'movie') return st.openPicker({ meta: m, type: m.type, videoId: m.id });
  st.openDetail({ type: m.type, id: m.id, preview: m });
}

export { errMsg };
