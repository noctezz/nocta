import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Loader2, Play, Puzzle, X, Zap } from 'lucide-react';
import { getStreams, streamQuality, streamSize, type StreamGroup } from '../lib/addons';
import { useLatest } from '../lib/useLatest';
import { useStore } from '../lib/store';
import { errMsg, resolveStream, streamToDesc } from '../lib/playback';
import { backdropOf } from '../lib/ui';
import type { Stream } from '../lib/types';

interface Row { stream: Stream; addon: string; key: string }

export function StreamPicker() {
  const picker = useLatest(useStore((s) => s.picker))!;
  const close = useStore((s) => s.closePicker);
  const addons = useStore((s) => s.addons);
  const key = useStore((s) => s.settings.torboxKey);
  const play = useStore((s) => s.play);
  const setPage = useStore((s) => s.setPage);
  const closeDetail = useStore((s) => s.closeDetail);
  const [groups, setGroups] = useState<StreamGroup[] | null>(null);
  const [cached, setCached] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ key: string; text: string } | null>(null);
  const [signal] = useState(() => ({ cancelled: false }));
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => () => { signal.cancelled = true; }, [signal]);

  useEffect(() => {
    let alive = true;
    getStreams(addons, picker.type, picker.videoId).then(async (g) => {
      if (!alive) return;
      setGroups(g);
      const hashes = g.flatMap((x) => x.streams).map((s) => s.infoHash).filter(Boolean) as string[];
      if (key && hashes.length && window.nocta) {
        try {
          const c: string[] = await window.nocta.torbox('checkCached', key, Array.from(new Set(hashes)));
          if (alive) setCached(new Set(c));
        } catch {}
      }
    });
    return () => { alive = false; };
  }, [addons, picker.type, picker.videoId, key]);

  const rows: Row[] = useMemo(() => {
    if (!groups) return [];
    const all = groups.flatMap((g) => g.streams.map((s, i) => ({ stream: s, addon: g.addon.manifest.name, key: `${g.addon.url}#${i}` })));
    const score = (r: Row) => {
      const q = streamQuality(r.stream);
      const isCached = r.stream.infoHash && cached.has(r.stream.infoHash.toLowerCase());
      const direct = !!r.stream.url || /\[TB\+|⚡|cached|instant/i.test(`${r.stream.name}`);
      return (isCached || direct ? 10000 : 0) + q.res;
    };
    return all.sort((a, b) => score(b) - score(a));
  }, [groups, cached]);

  const qualities = useMemo(() => {
    const set = new Set(rows.map((r) => streamQuality(r.stream).label).filter(Boolean));
    return ['all', ...['4K', '1440p', '1080p', '720p', '480p'].filter((q) => set.has(q))];
  }, [rows]);

  const shown = filter === 'all' ? rows : rows.filter((r) => streamQuality(r.stream).label === filter);
  const noStreamAddon = groups && groups.length === 0;

  const choose = async (r: Row) => {
    const s = r.stream;
    if (s.externalUrl || s.ytId) {
      window.nocta?.openExternal(s.externalUrl || `https://www.youtube.com/watch?v=${s.ytId}`);
      return;
    }
    const desc = streamToDesc(s);
    setBusy({ key: r.key, text: s.infoHash ? 'Connexion à TorBox…' : 'Chargement…' });
    try {
      const src = await resolveStream(desc, { season: picker.season, episode: picker.episode }, (u) =>
        setBusy({ key: r.key, text: `TorBox télécharge… ${u.progress}%` }), signal);
      if (signal.cancelled) return;
      closeDetail();
      play({
        src,
        title: picker.meta.name,
        subtitle: picker.episodeTitle,
        meta: picker.meta,
        type: picker.type,
        videoId: picker.videoId,
        season: picker.season,
        episode: picker.episode,
        stream: desc,
      });
    } catch (e) {
      if (!signal.cancelled) useStore.getState().toast(errMsg(e), 'error');
      setBusy(null);
    }
  };

  return (
    <motion.div
      className="modal-backdrop picker-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        className="picker"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className="picker-head" style={{ backgroundImage: `url(${backdropOf(picker.meta)})` }}>
          <div className="picker-head-fade" />
          <button className="round" onClick={close} aria-label="Fermer"><X size={20} /></button>
          <div>
            <small>Choisis une source</small>
            <h2>{picker.meta.name}</h2>
            {picker.episodeTitle && <p>{picker.episodeTitle}</p>}
          </div>
        </div>

        {qualities.length > 2 && (
          <div className="chips">
            {qualities.map((q) => (
              <button key={q} className={filter === q ? 'is-on' : ''} onClick={() => setFilter(q)}>
                {q === 'all' ? 'Toutes' : q}
              </button>
            ))}
          </div>
        )}

        <div className="picker-list">
          {!groups && Array.from({ length: 6 }, (_, i) => <div key={i} className="stream skeleton" />)}

          {noStreamAddon && (
            <div className="empty">
              <Puzzle size={40} />
              <h3>Aucun addon de sources installé</h3>
              <p>Installe l'addon TorBox (ou un autre addon de streams) pour pouvoir lancer la lecture.</p>
              <button className="btn btn-white" onClick={() => { close(); closeDetail(); setPage('addons'); }}>Gérer les addons</button>
            </div>
          )}

          {groups && !noStreamAddon && rows.length === 0 && (
            <div className="empty">
              <h3>Aucune source trouvée</h3>
              <p>Aucun addon n'a renvoyé de flux pour ce titre.</p>
              {groups.filter((g) => g.error).map((g) => <small key={g.addon.url}>{g.addon.manifest.name} : {g.error}</small>)}
            </div>
          )}

          {shown.map((r, i) => {
            const s = r.stream;
            const q = streamQuality(s);
            const size = streamSize(s);
            const isCached = !!(s.infoHash && cached.has(s.infoHash.toLowerCase()));
            const lines = (s.title || s.description || '').split('\n').filter(Boolean);
            const isBusy = busy?.key === r.key;
            return (
              <motion.button
                key={r.key}
                className={`stream ${isBusy ? 'is-busy' : ''}`}
                onClick={() => !busy && choose(r)}
                disabled={!!busy && !isBusy}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <div className={`stream-q q-${q.res || 0}`}>{q.label || '—'}</div>
                <div className="stream-info">
                  <div className="stream-name">
                    {(s.name || r.addon).split('\n').join(' · ')}
                  </div>
                  <div className="stream-title">{lines.slice(0, 2).join(' — ') || r.addon}</div>
                  <div className="stream-tags">
                    {isCached && <span className="tag tag-green"><Zap size={11} /> Instantané</span>}
                    {q.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    {size && <span className="tag">{size}</span>}
                    <span className="tag tag-dim">{r.addon}</span>
                  </div>
                  {isBusy && <div className="stream-busy">{busy.text}</div>}
                </div>
                <div className="stream-go">
                  {isBusy ? <Loader2 className="spin" size={22} /> : s.externalUrl || s.ytId ? <ExternalLink size={20} /> : <Play size={20} fill="currentColor" />}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
