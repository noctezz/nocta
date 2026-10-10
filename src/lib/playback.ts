import { useStore } from './store';
import type { Meta, MetaPreview, Stream, StreamDesc, Video } from './types';

export function errMsg(e: unknown): string {
  const m = String((e as any)?.message || e);
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export function streamToDesc(s: Stream): StreamDesc {
  return {
    url: s.url,
    infoHash: s.infoHash,
    fileIdx: s.fileIdx,
    filename: s.behaviorHints?.filename,
    label: (s.name || '').split('\n')[0],
    bingeGroup: s.behaviorHints?.bingeGroup,
  };
}

export type ResolveUpdate = { status: 'downloading'; progress: number; state: string };

/**
 * Transforme un descripteur de flux en URL lisible.
 * - url directe -> telle quelle
 * - infoHash    -> via TorBox (attend la fin du téléchargement si besoin)
 */
export async function resolveStream(
  desc: StreamDesc,
  ctx: { season?: number; episode?: number },
  onUpdate?: (u: ResolveUpdate) => void,
  signal?: { cancelled: boolean },
): Promise<string> {
  if (desc.localPath) return desc.localPath;
  if (desc.url) return desc.url;
  if (!desc.infoHash) throw new Error('Flux non supporté');
  const key = useStore.getState().settings.torboxKey;
  if (!key) throw new Error('Ajoute ta clé API TorBox dans les Paramètres pour lire ce flux');
  if (!window.nocta) throw new Error('TorBox nécessite l\'application de bureau');

  let torrentId: number | undefined;
  for (let i = 0; i < 400; i++) {
    if (signal?.cancelled) throw new Error('Annulé');
    const r = await window.nocta.torbox('resolve', key, {
      infoHash: desc.infoHash, fileIdx: desc.fileIdx, filename: desc.filename,
      season: ctx.season, episode: ctx.episode, torrentId,
    }).catch((e) => { throw new Error(errMsg(e)); });
    if (r.status === 'ready') return r.url as string;
    torrentId = r.torrentId;
    onUpdate?.({ status: 'downloading', progress: r.progress, state: r.state });
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error('TorBox met trop de temps à préparer ce fichier');
}

export function episodeLabel(v: { season?: number; episode?: number; number?: number }) {
  const e = v.episode ?? v.number;
  return v.season != null && e != null ? `S${v.season}:É${e}` : '';
}

export function sortedEpisodes(meta: Meta): Video[] {
  return (meta.videos || [])
    .filter((v) => v.season != null)
    .slice()
    .sort((a, b) => (a.season! - b.season!) || ((a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)));
}

export function nextEpisode(meta: Meta, videoId: string): Video | null {
  const eps = sortedEpisodes(meta).filter((v) => v.season! > 0);
  const i = eps.findIndex((v) => v.id === videoId);
  return i >= 0 && i < eps.length - 1 ? eps[i + 1] : null;
}

export function slimMeta(m: Meta | MetaPreview): MetaPreview {
  return {
    id: m.id, type: m.type, name: m.name, poster: m.poster, background: m.background, logo: m.logo,
    releaseInfo: m.releaseInfo, imdbRating: m.imdbRating, genres: m.genres, description: m.description,
  };
}

export function formatTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Ouvre le lecteur pour un fichier local */
export function playLocalFile(path: string) {
  const name = path.split(/[\\/]/).pop() || 'Vidéo';
  useStore.getState().play({
    src: path,
    title: name.replace(/\.[^.]+$/, ''),
    stream: { localPath: path },
  });
}
