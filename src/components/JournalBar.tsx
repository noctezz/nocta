import { NotebookPen, PenLine } from 'lucide-react';
import { useProfile } from '../lib/store';
import { journalOf, markFilm, openLog } from '../lib/journal';
import type { MetaPreview } from '../lib/types';
import { LikeButton, ratingLabel, StarInput } from './Stars';

/** Dans la fiche : ta note, ton coup de cœur, et l'ajout au journal */
export function JournalBar({ meta }: { meta: MetaPreview }) {
  const profile = useProfile();
  const j = journalOf(profile);
  const mark = j.marks[meta.id];
  const seen = j.entries.filter((e) => e.meta.id === meta.id).sort((a, b) => b.date.localeCompare(a.date));
  const last = seen[0];
  const fmt = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="jbar">
      <div className="jbar-rate">
        <span className="jbar-label">Ta note</span>
        <StarInput value={mark?.rating} onChange={(v) => markFilm(meta, { rating: v })} size={26} />
        <LikeButton liked={mark?.liked} onChange={(v) => markFilm(meta, { liked: v })} size={22} />
        <span className="jbar-word">{ratingLabel(mark?.rating)}</span>
      </div>
      <div className="jbar-actions">
        {last && (
          <span className="jbar-seen" title={seen.length > 1 ? `${seen.length} séances au journal` : undefined}>
            Vu le {fmt(last.date)}{seen.length > 1 ? ` · ${seen.length} fois` : ''}
          </span>
        )}
        {last?.review && <button className="jbar-btn" onClick={() => openLog(meta, { entry: last })}><PenLine size={16} /> Ta critique</button>}
        <button className="jbar-btn is-main" onClick={() => openLog(meta)}><NotebookPen size={16} /> {last ? 'Revu' : 'Ajouter au journal'}</button>
      </div>
    </div>
  );
}
