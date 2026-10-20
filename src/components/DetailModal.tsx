import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, CircleCheck, Circle, ListVideo, Play, Plus, X } from 'lucide-react';
import { getMeta, GENRE_FR } from '../lib/addons';
import { useLatest } from '../lib/useLatest';
import { TrailerPreview } from './TrailerPreview';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, logoOf, resumeEntry, year } from '../lib/ui';
import { episodeLabel, formatTime, slimMeta, sortedEpisodes } from '../lib/playback';
import { episodeTarget, nextUnwatched, playTarget } from '../lib/autoplay';
import type { Meta, Video, LangMode } from '../lib/types';

/** Langue de ce titre : VF, ou VO avec sous-titres français (mémorisé pour ce film / cette série) */
function LangSwitch({ explicit, fallback, onChange }: {
  explicit: LangMode | null;
  fallback: LangMode | null;
  onChange: (mode: LangMode | null) => void;
}) {
  const current = explicit || fallback;
  const pick = (m: LangMode) => onChange(explicit === m ? null : m);
  return (
    <div className="lang-switch" title="Choix mémorisé pour ce titre uniquement">
      <span>Audio</span>
      <button className={current === 'vf' ? 'is-on' : ''} onClick={() => pick('vf')}>VF</button>
      <button className={current === 'vo' ? 'is-on' : ''} onClick={() => pick('vo')}>VO · sous-titres FR</button>
      {!explicit && <small>par défaut</small>}
    </div>
  );
}

export function DetailModal() {
  const detail = useLatest(useStore((s) => s.detail))!;
  const close = useStore((s) => s.closeDetail);
  const addons = useStore((s) => s.addons);
  const setWatched = useStore((s) => s.setWatched);
  const picker = useStore((s) => s.picker);
  const toggleMyList = useStore((s) => s.toggleMyList);
  const profile = useProfile();
  const preferFrench = useStore((s) => s.settings.preferFrench);
  const setLangPref = useStore((s) => s.setLangPref);
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !useStore.getState().picker && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const entry = profile?.progress[detail.id];
  const episodes = useMemo(() => (meta ? sortedEpisodes(meta) : []), [meta]);
  const seasons = useMemo(() => {
    const s = Array.from(new Set(episodes.map((e) => e.season!)));
    return s.filter((x) => x > 0).concat(s.filter((x) => x === 0));
  }, [episodes]);

  const watched = profile?.watched || {};
  // Prochain épisode à regarder (après le dernier vu)
  const upNext = useMemo(() => (meta && episodes.length ? nextUnwatched(meta, profile?.watched) : null), [meta, episodes, profile?.watched]);

  useEffect(() => {
    if (season == null && seasons.length) setSeason(entry?.season ?? upNext?.season ?? seasons[0]);
  }, [seasons, season, entry, upNext]);

  if (!meta) return null;
  const inList = !!profile?.myList.some((m) => m.id === meta.id);
  const isSeries = meta.type === 'series' || episodes.length > 0;
  const logo = logoOf(meta);

  const playEpisode = (v: Video, manual = false) => playTarget(episodeTarget(meta, v), { manual });
  const movieTarget = { meta: slimMeta(meta), type: meta.type, videoId: meta.id };

  const play = () => {
    if (entry) return resumeEntry(entry);
    if (isSeries && upNext) return playEpisode(upNext);
    playTarget(movieTarget);
  };
  /** Choisir la source à la main (liste complète) */
  const chooseSource = () => {
    if (isSeries) {
      const v = (entry && episodes.find((e) => e.id === entry.videoId)) || upNext;
      if (v) return playEpisode(v, true);
    }
    playTarget(movieTarget, { manual: true });
  };

  const seasonEps = episodes.filter((e) => e.season === season);
  const seasonAllWatched = seasonEps.length > 0 && seasonEps.every((v) => watched[v.id]);
  const movieWatched = !isSeries && !!watched[meta.id];
  const firstEp = episodes.find((e) => e.season! > 0) || episodes[0];
  const nextLabel = upNext && upNext.id !== firstEp?.id ? episodeLabel(upNext) : '';

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
        <button className="round detail-close" data-nav-back onClick={close} aria-label="Fermer"><X size={22} /></button>

        <div className="detail-hero">
          <img src={backdropOf(meta)} alt="" draggable={false} />
          <TrailerPreview meta={meta} paused={!!picker} />
          <div className="detail-hero-fade" />
          <div className="detail-hero-content">
            {logo && logoOk
              ? <img className="detail-logo" src={logo} alt={meta.name} onError={() => setLogoOk(false)} />
              : <h1>{meta.name}</h1>}
            <div className="detail-actions">
              <button className="btn btn-white btn-lg" data-nav-default onClick={play}>
                <Play size={24} fill="currentColor" /> {entry ? 'Reprendre' : 'Lecture'}
                {!entry && isSeries && nextLabel && <span className="btn-sub">{nextLabel}</span>}
              </button>
              <button className="round round-lg" onClick={chooseSource} title="Choisir la source">
                <ListVideo size={22} />
              </button>
              <button className="round round-lg" onClick={() => toggleMyList(meta)} title={inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
                {inList ? <Check size={22} /> : <Plus size={22} />}
              </button>
              {!isSeries && (
                <button
                  className={`round round-lg ${movieWatched ? 'is-watched' : ''}`}
                  onClick={() => setWatched([meta.id], !movieWatched)}
                  title={movieWatched ? 'Marquer comme non vu' : 'Marquer comme vu'}
                >
                  <CheckCheck size={22} />
                </button>
              )}
              {movieWatched && <span className="watched-pill"><CircleCheck size={16} /> Vu</span>}
            </div>
            <LangSwitch
              explicit={profile?.langPrefs?.[meta.id] || null}
              fallback={preferFrench ? 'vf' : null}
              onChange={(mode) => {
                setLangPref(meta.id, mode);
                const label = mode === 'vo' ? 'VO sous-titrée en français' : mode === 'vf' ? 'VF' : 'réglage général';
                useStore.getState().toast(`${meta.name} : ${label}`, 'success');
              }}
            />
            {entry && (
              <div className="detail-resume">
                <div className="bar"><div style={{ width: `${(entry.position / (entry.duration || 1)) * 100}%` }} /></div>
                <span>
                  {entry.episodeTitle ? `${entry.episodeTitle} · ` : ''}
                  {entry.duration ? `${formatTime(entry.duration - entry.position)} restantes` : 'Prochain épisode'}
                </span>
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
              {seasonEps.length > 0 && (
                <button className="season-watched" onClick={() => setWatched(seasonEps.map((v) => v.id), !seasonAllWatched)}>
                  {seasonAllWatched ? <CircleCheck size={16} /> : <Circle size={16} />}
                  {seasonAllWatched ? 'Saison vue' : 'Marquer la saison comme vue'}
                </button>
              )}
            </div>
            {loading && !episodes.length && <div className="skeleton-text" />}
            {seasonEps.map((v, i) => {
              const n = v.episode ?? v.number ?? i + 1;
              const isCurrent = entry?.videoId === v.id;
              const isWatched = !!watched[v.id];
              const isUpNext = !entry && upNext?.id === v.id;
              return (
                <motion.div
                  role="button"
                  tabIndex={0}
                  key={v.id}
                  className={`episode ${isCurrent || isUpNext ? 'is-current' : ''} ${isWatched ? 'is-watched' : ''}`}
                  onClick={() => playEpisode(v)}
                  onKeyDown={(e) => e.key === 'Enter' && playEpisode(v)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.4) }}
                >
                  <span className="episode-n">{n}</span>
                  <div className="episode-thumb">
                    {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : <div className="card-fallback" />}
                    <div className="episode-play"><Play size={22} fill="currentColor" /></div>
                    {isCurrent && entry && entry.duration > 0 && !isWatched && (
                      <div className="card-progress"><div style={{ width: `${(entry.position / entry.duration) * 100}%` }} /></div>
                    )}
                    {isWatched && <div className="card-progress"><div style={{ width: '100%' }} /></div>}
                    {isWatched && <span className="episode-seen"><Check size={13} strokeWidth={3} /> Vu</span>}
                  </div>
                  <div className="episode-info">
                    <div className="episode-top">
                      <strong>
                        {v.title || v.name || `Épisode ${n}`}
                        {isUpNext && <span className="up-next">À suivre</span>}
                      </strong>
                      <div className="episode-tools">
                        {v.released && <span className="muted">{new Date(v.released).toLocaleDateString('fr-FR')}</span>}
                        <button
                          className="ep-tool"
                          title="Choisir la source"
                          onClick={(e) => { e.stopPropagation(); playEpisode(v, true); }}
                        >
                          <ListVideo size={16} />
                        </button>
                        <button
                          className={`ep-tool ${isWatched ? 'is-on' : ''}`}
                          title={isWatched ? 'Marquer comme non vu' : 'Marquer comme vu'}
                          onClick={(e) => { e.stopPropagation(); setWatched([v.id], !isWatched); }}
                        >
                          {isWatched ? <CircleCheck size={18} /> : <Circle size={18} />}
                        </button>
                      </div>
                    </div>
                    {(v.overview || v.description) && <p>{v.overview || v.description}</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
