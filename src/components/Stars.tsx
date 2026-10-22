import { useState } from 'react';
import { Heart } from 'lucide-react';

const STAR = 'M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** Une étoile, pleine, à moitié ou vide */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const id = `h${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={id}><stop offset="50%" stopColor="currentColor" /><stop offset="50%" stopColor="transparent" /></linearGradient>
      </defs>
      <path d={STAR} className="st-empty" />
      {fill > 0 && <path d={STAR} fill={fill === 1 ? 'currentColor' : `url(#${id})`} className="st-full" />}
    </svg>
  );
}

/** Note en lecture seule */
export function Stars({ value, size = 14 }: { value?: number; size?: number }) {
  if (!value) return null;
  return (
    <span className="stars" aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} fill={value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0} />)}
    </span>
  );
}

/** Étoiles cliquables, à la demi-étoile près (cliquer la note actuelle l'efface) */
export function StarInput({ value, onChange, size = 30 }: { value?: number; onChange: (v: number | null) => void; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const at = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX - r.left < r.width / 2 ? i - 0.5 : i;
  };
  return (
    <span className={`star-input ${hover != null ? 'is-hover' : ''}`} onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseMove={(e) => setHover(at(e, i))}
          onClick={(e) => { const v = at(e, i); onChange(v === value ? null : v); }}
          aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
        >
          <Star size={size} fill={shown >= i ? 1 : shown >= i - 0.5 ? 0.5 : 0} />
        </button>
      ))}
    </span>
  );
}

export function LikeButton({ liked, onChange, size = 26 }: { liked?: boolean; onChange: (v: boolean) => void; size?: number }) {
  return (
    <button type="button" className={`like-btn ${liked ? 'is-on' : ''}`} onClick={() => onChange(!liked)} title={liked ? 'Retirer des coups de cœur' : 'Coup de cœur'}>
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} />
    </button>
  );
}

/** « Quatre étoiles et demie » pour l'affichage en toutes lettres */
export function ratingLabel(v?: number | null) {
  if (!v) return 'Pas encore noté';
  const words = ['', 'Nul', 'Bof', 'Pas mal', 'Bien', 'Très bien', 'Super', 'Excellent', 'Génial', 'Un chef-d\'œuvre', 'Culte'];
  return words[Math.round(v * 2)];
}
