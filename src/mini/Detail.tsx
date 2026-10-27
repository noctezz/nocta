import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Play, Plus } from 'lucide-react';
import { getMeta } from '../lib/addons';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, resumeEntry } from '../lib/ui';
import { episodeTarget, nextUnwatched, playTarget } from '../lib/autoplay';
import { slimMeta, sortedEpisodes, WATCHED_RATIO } from '../lib/playback';
import { langModeFor } from '../lib/langPrefs';
import type { Meta, MetaPreview, Video } from '../lib/types';
import { genresOf, runtimeOf, yearOf } from './data';

export interface DetailRef { type: string; id: string; preview?: MetaPreview }

/** Fiche d'un film ou d'une série, en pleine page */
export function Detail({ target, onClose }: { target: DetailRef; onClose: () => void }) {
  const addons = useStore((s) => s.addons);
  const profile = useProfile();
  const toggleMyList = useStore((s) => s.toggleMyList);
  const setLangPref = useStore((s) => s.setLangPref);
  const preferFrench = useStore((s) => s.settings.preferFrench);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getMeta(addons, target.type, target.id)
      .then((m) => { if (alive) { if (m) setMeta(m); else setFailed(true); } })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [target.type, target.id]);

  // Échap ferme la fiche (sauf si le choix des sources ou le lecteur est ouvert par-dessus)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === 'Escape' && !st.picker && !st.player) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const m: MetaPreview | null = meta || target.preview || null;
  const series = target.type === 'series';
  const entry = profile?.progress[target.id];
  const inList = !!profile?.myList.some((x) => x.id === target.id);
  const lang = langModeFor(target.id) || (preferFrench ? 'vf' : 'vo');

  // Saisons (épisodes spéciaux à la fin)
  const seasons = useMemo(() => {
    const eps = meta ? sortedEpisodes(meta) : [];
    const map = new Map<number, Video[]>();
    for (const v of eps) {
      const s = v.season ?? 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(v);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 0 ? 1 : b === 0 ? -1 : a - b));
  }, [meta]);
  const next = meta && series ? nextUnwatched(meta, profile?.watched) : null;
  const [season, setSeason] = useState<number | null>(null);
  const shown = season ?? entry?.season ?? next?.season ?? seasons[0]?.[0] ?? 1;
  const episodes = seasons.find(([s]) => s === shown)?.[1] || [];

  const play = () => {
    if (entry) return resumeEntry(entry);
    if (!m) return;
    if (!series) return playTarget({ meta: slimMeta(m), type: m.type, videoId: m.id });
    if (meta && next) return playTarget(episodeTarget(meta, next));
  };
  const playLabel = entry
    ? entry.season ? `Reprendre  S${entry.season} · É${entry.episode}` : 'Reprendre'
    : series ? (next ? `Lecture  S${next.season} · É${next.episode ?? next.number}` : 'Lecture') : 'Lecture';

  const cast = (meta?.cast || []).slice(0, 5);
  const director = (meta?.director || []).slice(0, 2);

  return (
    <motion.div
      className="mn-detail"
      ref={scroller}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="mn-detail-hero">
        {m && backdropOf(m) && (
          <img src={backdropOf(m)} alt="" className={ready ? 'is-ready' : ''} onLoad={() => setReady(true)} />
        )}
        <div className="mn-detail-shade" />
      </div>

      <button className="mn-back" onClick={onClose}><ArrowLeft size={18} strokeWidth={1.6} /> Retour</button>

      <div className="mn-detail-body">
        {m ? (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}>
            <span className="mn-kicker">{series ? 'Série' : 'Film'}</span>
            <h1 className="mn-detail-title">{m.name}</h1>
            <p className="mn-meta">
              {[yearOf(m), runtimeOf(m), ...genresOf(m), m.imdbRating ? `IMDb ${m.imdbRating}` : ''].filter(Boolean).join('  ·  ')}
            </p>

            <div className="mn-actions">
              <button className="mn-btn mn-btn-light" onClick={play} disabled={series && !meta}>
                <Play size={17} fill="currentColor" /> {playLabel}
              </button>
              <button className={`mn-btn mn-btn-ghost ${inList ? 'is-on' : ''}`} onClick={() => toggleMyList(slimMeta(m))}>
                {inList ? <Check size={17} /> : <Plus size={17} />} Ma liste
              </button>
              <div className="mn-lang" role="group" aria-label="Langue">
                {(['vf', 'vo'] as const).map((l) => (
                  <button key={l} className={lang === l ? 'is-on' : ''} onClick={() => setLangPref(target.id, l)}>
                    {l === 'vf' ? 'VF' : 'VO'}
                  </button>
                ))}
              </div>
            </div>

            {entry && entry.duration > 0 && (
              <div className="mn-resume">
                <div className="mn-resume-bar"><div style={{ width: `${Math.min(100, (entry.position / entry.duration) * 100)}%` }} /></div>
                <span>{Math.max(1, Math.round((entry.duration - entry.position) / 60))} min restantes</span>
              </div>
            )}

            {m.description && <p className="mn-synopsis">{m.description}</p>}

            {(director.length > 0 || cast.length > 0) && (
              <dl className="mn-credits">
                {director.length > 0 && <><dt>Réalisation</dt><dd>{director.join(', ')}</dd></>}
                {cast.length > 0 && <><dt>Avec</dt><dd>{cast.join(', ')}</dd></>}
              </dl>
            )}

            {series && (
              <section className="mn-episodes">
                {seasons.length > 1 && (
                  <nav className="mn-seasons">
                    {seasons.map(([s]) => (
                      <button key={s} className={s === shown ? 'is-on' : ''} onClick={() => setSeason(s)}>
                        {s === 0 ? 'Bonus' : `Saison ${s}`}
                      </button>
                    ))}
                  </nav>
                )}
                {!meta && !failed && <p className="mn-muted">Chargement des épisodes…</p>}
                <ol className="mn-ep-list">
                  {episodes.map((v) => (
                    <Episode key={v.id} meta={meta!} v={v} />
                  ))}
                </ol>
              </section>
            )}
          </motion.div>
        ) : (
          <p className="mn-muted">{failed ? 'Fiche introuvable pour le moment.' : 'Chargement…'}</p>
        )}
      </div>
    </motion.div>
  );
}

function Episode({ meta, v }: { meta: Meta; v: Video }) {
  const profile = useProfile();
  const setWatched = useStore((s) => s.setWatched);
  const [ok, setOk] = useState(true);
  const entry = profile?.progress[meta.id];
  const current = entry?.videoId === v.id && entry.duration > 0 ? entry.position / entry.duration : 0;
  const watched = !!profile?.watched?.[v.id] || current >= WATCHED_RATIO;
  const n = v.episode ?? v.number;
  const date = v.released ? new Date(v.released) : null;
  const upcoming = !!date && date.getTime() > Date.now();

  return (
    <li className={`mn-ep ${watched ? 'is-watched' : ''}`}>
      <button className="mn-ep-main" onClick={() => playTarget(episodeTarget(meta, v))} disabled={upcoming}>
        <div className="mn-ep-img">
          {ok && v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" onError={() => setOk(false)} /> : <span>{n}</span>}
          {!upcoming && <span className="mn-ep-play"><Play size={16} fill="currentColor" /></span>}
          {current > 0 && current < WATCHED_RATIO && <div className="mn-card-bar"><div style={{ width: `${current * 100}%` }} /></div>}
        </div>
        <div className="mn-ep-text">
          <strong><em>{n}</em> {v.title || v.name || `Épisode ${n}`}</strong>
          {(v.overview || v.description) && <p>{v.overview || v.description}</p>}
          {upcoming && date && <small>Le {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</small>}
        </div>
      </button>
      <button
        className={`mn-ep-check ${watched ? 'is-on' : ''}`}
        onClick={() => setWatched([v.id], !watched)}
        title={watched ? 'Marquer comme non vu' : 'Marquer comme vu'}
        aria-label={watched ? 'Marquer comme non vu' : 'Marquer comme vu'}
      >
        <Check size={15} />
      </button>
    </li>
  );
}
