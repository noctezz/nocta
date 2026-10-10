import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Play, Plus, X } from 'lucide-react';
import { getMeta, GENRE_FR } from '../lib/addons';
import { useLatest } from '../lib/useLatest';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, logoOf, resumeEntry, year } from '../lib/ui';
import { episodeLabel, formatTime, slimMeta, sortedEpisodes } from '../lib/playback';
import type { Meta, Video } from '../lib/types';

export function DetailModal() {
  const detail = useLatest(useStore((s) => s.detail))!;
  const close = useStore((s) => s.closeDetail);
  const addons = useStore((s) => s.addons);
  const openPicker = useStore((s) => s.openPicker);
  const toggleMyList = useStore((s) => s.toggleMyList);
  const profile = useProfile();
  const [meta, setMeta] = useState<Meta | null>((detail.preview as Meta) || null);
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<number | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMeta(addons, detail.type, detail.id)
      .then((m) => { if (alive && m) setMeta((prev) => ({ ...(prev || {}), ...m })); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [addons, detail.type, detail.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const entry = profile?.progress[detail.id];
  const episodes = useMemo(() => (meta ? sortedEpisodes(meta) : []), [meta]);
  const seasons = useMemo(() => {
    const s = Array.from(new Set(episodes.map((e) => e.season!)));
    return s.filter((x) => x > 0).concat(s.filter((x) => x === 0));
  }, [episodes]);

  useEffect(() => {
    if (season == null && seasons.length) setSeason(entry?.season ?? seasons[0]);
  }, [seasons, season, entry]);

  if (!meta) return null;
  const inList = !!profile?.myList.some((m) => m.id === meta.id);
  const isSeries = meta.type === 'series' || episodes.length > 0;
  const logo = logoOf(meta);

  const playEpisode = (v: Video) => openPicker({
    meta: slimMeta(meta), type: meta.type, videoId: v.id, season: v.season, episode: v.episode ?? v.number,
    episodeTitle: `${episodeLabel(v)} « ${v.title || v.name || `Épisode ${v.episode ?? v.number}`} »`,
  });

  const play = () => {
    if (entry) return resumeEntry(entry);
    if (isSeries) {
      const first = episodes.find((e) => e.season! > 0) || episodes[0];
      if (first) return playEpisode(first);
    }
    openPicker({ meta: slimMeta(meta), type: meta.type, videoId: meta.id });
  };

  const seasonEps = episodes.filter((e) => e.season === season);

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        className="detail"
        initial={{ opacity: 0, y: 60, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 240, damping: 28 }}
      >
        <button className="round detail-close" onClick={close} aria-label="Fermer"><X size={22} /></button>

        <div className="detail-hero">
          <img src={backdropOf(meta)} alt="" draggable={false} />
          <div className="detail-hero-fade" />
          <div className="detail-hero-content">
            {logo && logoOk
              ? <img className="detail-logo" src={logo} alt={meta.name} onError={() => setLogoOk(false)} />
              : <h1>{meta.name}</h1>}
            <div className="detail-actions">
              <button className="btn btn-white btn-lg" onClick={play}>
                <Play size={24} fill="currentColor" /> {entry ? 'Reprendre' : 'Lecture'}
              </button>
              <button className="round round-lg" onClick={() => toggleMyList(meta)} title={inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
                {inList ? <Check size={22} /> : <Plus size={22} />}
              </button>
            </div>
            {entry && (
              <div className="detail-resume">
                <div className="bar"><div style={{ width: `${(entry.position / (entry.duration || 1)) * 100}%` }} /></div>
                <span>{entry.episodeTitle ? `${entry.episodeTitle} · ` : ''}{formatTime(entry.duration - entry.position)} restantes</span>
              </div>
            )}
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-main">
            <div className="detail-meta">
              {meta.imdbRating && <span className="match">★ {meta.imdbRating} IMDb</span>}
              {year(meta) && <span>{year(meta)}</span>}
              {meta.runtime && <span>{meta.runtime}</span>}
              {isSeries && seasons.length > 0 && <span>{seasons.filter((s) => s > 0).length} saison{seasons.length > 1 ? 's' : ''}</span>}
              <span className="hd">HD</span>
            </div>
            {meta.description
              ? <p className="detail-desc">{meta.description}</p>
              : loading && <div className="skeleton-text" />}
          </div>
          <div className="detail-side">
            {meta.cast && meta.cast.length > 0 && <p><span>Distribution :</span> {meta.cast.slice(0, 5).join(', ')}</p>}
            {meta.genres && meta.genres.length > 0 && <p><span>Genres :</span> {meta.genres.map((g) => GENRE_FR[g] || g).join(', ')}</p>}
            {meta.director && meta.director.length > 0 && <p><span>Réalisation :</span> {meta.director.join(', ')}</p>}
          </div>
        </div>

        {isSeries && (
          <div className="episodes">
            <div className="episodes-head">
              <h3>Épisodes</h3>
              {seasons.length > 1 && (
                <select className="select" value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))}>
                  {seasons.map((s) => <option key={s} value={s}>{s === 0 ? 'Bonus' : `Saison ${s}`}</option>)}
                </select>
              )}
              {seasons.length === 1 && <span className="muted">Saison {seasons[0]}</span>}
            </div>
            {loading && !episodes.length && <div className="skeleton-text" />}
            {seasonEps.map((v, i) => {
              const n = v.episode ?? v.number ?? i + 1;
              const isCurrent = entry?.videoId === v.id;
              return (
                <motion.button
                  key={v.id}
                  className={`episode ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => playEpisode(v)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.4) }}
                >
                  <span className="episode-n">{n}</span>
                  <div className="episode-thumb">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : <div className="card-fallback" />}
                    <div className="episode-play"><Play size={22} fill="currentColor" /></div>
                    {isCurrent && entry && (
                      <div className="card-progress"><div style={{ width: `${(entry.position / (entry.duration || 1)) * 100}%` }} /></div>
                    )}
                  </div>
                  <div className="episode-info">
                    <div className="episode-top">
                      <strong>{v.title || v.name || `Épisode ${n}`}</strong>
                      {v.released && <span className="muted">{new Date(v.released).toLocaleDateString('fr-FR')}</span>}
                    </div>
                    {(v.overview || v.description) && <p>{v.overview || v.description}</p>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
