import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Repeat, Trash2, X } from 'lucide-react';
import { getMeta } from '../lib/addons';
import { sortedEpisodes } from '../lib/playback';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, posterOf, year } from '../lib/ui';
import {
  closeLog, deleteEntry, episodeKey, journalOf, levelOf, saveEntry, seasonKey, today, useLogModal,
} from '../lib/journal';
import type { Meta, Video } from '../lib/types';
import { LikeButton, ratingLabel, StarInput } from './Stars';

/** « Ajouter au journal » : date, note, coup de cœur, critique (d'un film, d'une série, d'une saison ou d'un épisode) */
export function LogModal() {
  const { meta, entry } = useLogModal();
  return <AnimatePresence>{meta && <LogDialog key={entry?.id || meta.id} />}</AnimatePresence>;
}

type Level = 'title' | 'season' | 'episode';

/** Saisons et épisodes d'une série (fiche complète) */
function useEpisodes(id: string, isSeries: boolean) {
  const addons = useStore((s) => s.addons);
  const [eps, setEps] = useState<Video[]>([]);
  useEffect(() => {
    if (!isSeries) return;
    let alive = true;
    getMeta(addons, 'series', id).then((m) => alive && m && setEps(sortedEpisodes(m as Meta))).catch(() => {});
    return () => { alive = false; };
  }, [id, isSeries, addons]);
  return eps;
}

function LogDialog() {
  const { meta, entry, preset } = useLogModal();
  const profile = useProfile();
  const j = journalOf(profile);
  const isSeries = meta?.type === 'series';
  const eps = useEpisodes(meta?.id || '', isSeries);
  const seasons = useMemo(() => [...new Set(eps.map((v) => v.season ?? 1))].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)), [eps]);

  const start = entry || preset || {};
  const [level, setLevel] = useState<Level>(levelOf(start));
  const [season, setSeason] = useState<number>(start.season ?? 1);
  const [episode, setEpisode] = useState<number>(start.episode ?? 1);
  const seasonEps = eps.filter((v) => (v.season ?? 1) === season);
  const ep = seasonEps.find((v) => (v.episode ?? v.number) === episode);

  /** Note déjà donnée à ce qu'on vise (titre, saison ou épisode) */
  const markFor = (l: Level, s: number, e: number) => {
    if (!meta) return undefined;
    if (l === 'season') return j.seasons?.[seasonKey(meta.id, s)];
    if (l === 'episode') return j.episodes?.[episodeKey(meta.id, s, e)];
    return j.marks[meta.id];
  };
  const initial = markFor(level, season, episode);
  const [rating, setRating] = useState<number | undefined>(entry ? entry.rating : preset?.rating ?? initial?.rating);
  const [liked, setLiked] = useState<boolean>(entry ? !!entry.liked : preset?.liked ?? !!initial?.liked);
  const [touched, setTouched] = useState(!!entry || preset?.rating != null);
  const [date, setDate] = useState(entry?.date || preset?.date || today());
  const [review, setReview] = useState(entry?.review || '');
  const [spoilers, setSpoilers] = useState(!!entry?.spoilers);
  const sameTarget = (x: { meta: { id: string }; season?: number; episode?: number }) =>
    !!meta && x.meta.id === meta.id && levelOf(x) === level && (level === 'title' || x.season === season) && (level !== 'episode' || x.episode === episode);
  const seenBefore = j.entries.some((x) => x.id !== entry?.id && sameTarget(x));
  const [rewatch, setRewatch] = useState<boolean | null>(entry ? !!entry.rewatch : null);

  // Nouvelle cible choisie (saison, épisode…) : on reprend la note qu'on lui avait déjà donnée
  useEffect(() => {
    if (touched) return;
    const m = markFor(level, season, episode);
    setRating(m?.rating);
    setLiked(!!m?.liked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, season, episode]);

  // Saison choisie sans cet épisode : premier épisode de la saison
  useEffect(() => {
    if (seasonEps.length && !ep) setEpisode(seasonEps[0].episode ?? seasonEps[0].number ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, eps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeLog(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!meta) return null;
  const save = () => {
    saveEntry({
      id: entry?.id, meta, date, rating, liked, review: review.trim() || undefined, spoilers: spoilers && !!review.trim(),
      rewatch: rewatch ?? seenBefore,
      ...(level !== 'title' ? { season } : {}),
      ...(level === 'episode' ? { episode, episodeTitle: ep?.title || ep?.name } : {}),
    });
    closeLog();
  };
  const target = level === 'season' ? (season === 0 ? 'les bonus' : `la saison ${season}`) : level === 'episode' ? `l'épisode ${episode}` : isSeries ? 'la série' : 'le film';

  return (
    <motion.div className="log-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && closeLog()}>
      <motion.div className="log" initial={{ y: 40, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <div className="log-bg" style={{ backgroundImage: `url(${backdropOf(meta)})` }} />
        <button className="log-close" onClick={closeLog} aria-label="Fermer"><X size={20} /></button>
        <div className="log-grid">
          <img className="log-poster" src={posterOf(meta)} alt="" />
          <div className="log-main">
            <span className="log-kicker">{entry ? 'Modifier la séance' : 'J\'ai vu…'}</span>
            <h2>{meta.name} {year(meta) && <small>{year(meta).slice(0, 4)}</small>}</h2>

            {isSeries && (
              <div className="log-target">
                <div className="log-seg">
                  {([['title', 'La série'], ['season', 'Une saison'], ['episode', 'Un épisode']] as const).map(([l, label]) => (
                    <button key={l} type="button" className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)} disabled={l !== 'title' && !seasons.length && !entry}>{label}</button>
                  ))}
                </div>
                {level !== 'title' && (
                  <select className="select" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                    {(seasons.length ? seasons : [season]).map((s) => <option key={s} value={s}>{s === 0 ? 'Bonus' : `Saison ${s}`}</option>)}
                  </select>
                )}
                {level === 'episode' && (
                  <select className="select log-ep" value={episode} onChange={(e) => setEpisode(Number(e.target.value))}>
                    {(seasonEps.length ? seasonEps : [{ id: 'x', episode } as Video]).map((v) => {
                      const n = v.episode ?? v.number ?? 0;
                      return <option key={v.id} value={n}>{`Épisode ${n}${v.title || v.name ? ` · ${v.title || v.name}` : ''}`}</option>;
                    })}
                  </select>
                )}
              </div>
            )}

            <div className="log-row">
              <label className="log-date">
                <span>Vu le</span>
                <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
              </label>
              <button type="button" className={`log-chip ${(rewatch ?? seenBefore) ? 'is-on' : ''}`} onClick={() => setRewatch(!(rewatch ?? seenBefore))}>
                <Repeat size={15} /> Je l'avais déjà vu{level === 'title' && isSeries ? 'e' : ''}
              </button>
            </div>

            <div className="log-rate">
              <StarInput value={rating} onChange={(v) => { setTouched(true); setRating(v ?? undefined); }} size={34} />
              <LikeButton liked={liked} onChange={(v) => { setTouched(true); setLiked(v); }} size={28} />
              <span className="log-rate-label">{ratingLabel(rating)}</span>
            </div>

            <textarea
              className="log-review"
              placeholder={`Ta critique de ${target} (facultatif)…`}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              rows={5}
            />
            <div className="log-foot">
              <label className="log-spoil">
                <input type="checkbox" checked={spoilers} onChange={(e) => setSpoilers(e.target.checked)} disabled={!review.trim()} />
                Contient des spoilers
              </label>
              {entry && (
                <button className="log-delete" onClick={() => { deleteEntry(entry.id); closeLog(); }}><Trash2 size={15} /> Supprimer</button>
              )}
              <button className="btn btn-white" onClick={save}>{entry ? 'Enregistrer' : 'Ajouter au journal'}</button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
