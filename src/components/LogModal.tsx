import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Repeat, Trash2, X } from 'lucide-react';
import { useProfile } from '../lib/store';
import { backdropOf, posterOf, year } from '../lib/ui';
import { closeLog, deleteEntry, journalOf, saveEntry, today, useLogModal } from '../lib/journal';
import { LikeButton, ratingLabel, StarInput } from './Stars';

/** « Ajouter au journal » : date, note, coup de cœur, critique */
export function LogModal() {
  const { meta, entry } = useLogModal();
  return <AnimatePresence>{meta && <LogDialog key={entry?.id || meta.id} />}</AnimatePresence>;
}

function LogDialog() {
  const { meta, entry, preset } = useLogModal();
  const profile = useProfile();
  const j = journalOf(profile);
  const mark = meta ? j.marks[meta.id] : undefined;
  const seenBefore = !!meta && j.entries.some((e) => e.meta.id === meta.id && e.id !== entry?.id);
  const [date, setDate] = useState(entry?.date || preset?.date || today());
  const [rating, setRating] = useState<number | undefined>(entry ? entry.rating : preset?.rating ?? mark?.rating);
  const [liked, setLiked] = useState<boolean>(entry ? !!entry.liked : preset?.liked ?? !!mark?.liked);
  const [review, setReview] = useState(entry?.review || '');
  const [spoilers, setSpoilers] = useState(!!entry?.spoilers);
  const [rewatch, setRewatch] = useState(entry ? !!entry.rewatch : seenBefore);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeLog(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!meta) return null;
  const save = () => {
    saveEntry({ id: entry?.id, meta, date, rating, liked, review: review.trim() || undefined, spoilers: spoilers && !!review.trim(), rewatch });
    closeLog();
  };

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

            <div className="log-row">
              <label className="log-date">
                <span>Vu le</span>
                <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
              </label>
              <button type="button" className={`log-chip ${rewatch ? 'is-on' : ''}`} onClick={() => setRewatch(!rewatch)}>
                <Repeat size={15} /> Je l'avais déjà vu
              </button>
            </div>

            <div className="log-rate">
              <StarInput value={rating} onChange={(v) => setRating(v ?? undefined)} size={34} />
              <LikeButton liked={liked} onChange={setLiked} size={28} />
              <span className="log-rate-label">{ratingLabel(rating)}</span>
            </div>

            <textarea
              className="log-review"
              placeholder="Ta critique (facultatif)…"
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
