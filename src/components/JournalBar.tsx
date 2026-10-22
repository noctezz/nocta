import { NotebookPen, PenLine, Trash2 } from 'lucide-react';
import { useProfile } from '../lib/store';
import { episodeKey, inJournal, journalOf, markFilm, markPart, openLog, removeTitle, seasonKey } from '../lib/journal';
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
        {inJournal(j, meta.id) && (
          <button className="jbar-icon" onClick={() => removeTitle(meta)} title="Retirer de mon journal"><Trash2 size={16} /></button>
        )}
        <button className="jbar-btn is-main" onClick={() => openLog(meta)}><NotebookPen size={16} /> {last ? 'Revu' : 'Ajouter au journal'}</button>
      </div>
    </div>
  );
}

/** En tête de la liste d'épisodes : la note de la saison affichée */
export function SeasonRate({ meta, season }: { meta: MetaPreview; season: number }) {
  const profile = useProfile();
  const m = journalOf(profile).seasons?.[seasonKey(meta.id, season)];
  return (
    <div className="season-rate" title={`Ta note pour la saison ${season}`}>
      <span>Ta note</span>
      <StarInput value={m?.rating} onChange={(v) => markPart(meta, season, null, { rating: v })} size={18} />
      <button className="season-rate-log" onClick={() => openLog(meta, { preset: { season } })} title="Ajouter la saison au journal"><NotebookPen size={15} /></button>
    </div>
  );
}

/** Sur chaque épisode : sa note (visible au survol tant qu'il n'est pas noté) */
export function EpisodeRate({ meta, season, episode }: { meta: MetaPreview; season: number; episode: number }) {
  const profile = useProfile();
  const m = journalOf(profile).episodes?.[episodeKey(meta.id, season, episode)];
  return (
    <span className={`ep-rate ${m?.rating ? 'is-rated' : ''}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <StarInput value={m?.rating} onChange={(v) => markPart(meta, season, episode, { rating: v })} size={15} />
    </span>
  );
}
