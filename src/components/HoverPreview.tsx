import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Play, Plus, X } from 'lucide-react';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, logoOf, quickPlay, useHover, year } from '../lib/ui';
import { GENRE_FR } from '../lib/addons';
import { formatTime } from '../lib/playback';

/** Popup qui "grandit" depuis la vignette survolée */
export function HoverPreview() {
  const { item, rect, entry, hide } = useHover();
  const profile = useProfile();
  const toggleMyList = useStore((s) => s.toggleMyList);
  const removeProgress = useStore((s) => s.removeProgress);
  const openDetail = useStore((s) => s.openDetail);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    setLogoOk(true);
    if (!item) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, { passive: true, once: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [item, hide]);

  const inList = !!(item && profile?.myList.some((m) => m.id === item.id));
  let style: React.CSSProperties = {};
  let origin = 'center';
  if (rect) {
    const w = Math.max(rect.width * 1.5, 330);
    let left = rect.left - (w - rect.width) / 2;
    if (left < 16) { left = rect.left; origin = 'left'; }
    if (left + w > window.innerWidth - 16) { left = rect.right - w; origin = 'right'; }
    style = { left, top: rect.top + window.scrollY - rect.height * 0.32, width: w };
  }
  const logo = item ? logoOf(item) : undefined;

  return (
    <AnimatePresence>
      {item && rect && (
        <motion.div
          key={item.id}
          className="hover-card"
          style={{ ...style, transformOrigin: `${origin} center` }}
          initial={{ opacity: 0, scale: 0.67 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.75 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          onMouseLeave={hide}
        >
          <div className="hover-img" onClick={() => { hide(); openDetail({ type: item.type, id: item.id, preview: item }); }}>
            <img src={backdropOf(item)} alt="" draggable={false} />
            {logo && logoOk
              ? <img className="hover-logo" src={logo} alt={item.name} onError={() => setLogoOk(false)} />
              : <div className="hover-title">{item.name}</div>}
          </div>
          <div className="hover-body">
            <div className="hover-actions">
              <button className="round round-white" onClick={() => { hide(); quickPlay(item); }} title="Lecture">
                <Play size={18} fill="currentColor" />
              </button>
              <button className="round" onClick={() => toggleMyList(item)} title={inList ? 'Retirer de ma liste' : 'Ajouter à ma liste'}>
                {inList ? <Check size={18} /> : <Plus size={18} />}
              </button>
              {entry && (
                <button className="round" onClick={() => { removeProgress(item.id); hide(); }} title="Retirer de « Reprendre »">
                  <X size={18} />
                </button>
              )}
              <button className="round push" onClick={() => { hide(); openDetail({ type: item.type, id: item.id, preview: item }); }} title="Plus d'infos">
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="hover-meta">
              {item.imdbRating && <span className="match">★ {item.imdbRating}</span>}
              <span className="badge">{item.type === 'series' ? 'Série' : 'Film'}</span>
              {year(item) && <span>{year(item)}</span>}
              <span className="hd">HD</span>
            </div>
            {entry && (
              <div className="hover-progress">
                <div className="bar"><div style={{ width: `${Math.min(100, (entry.position / (entry.duration || 1)) * 100)}%` }} /></div>
                <span>{entry.episodeTitle ? `${entry.episodeTitle} · ` : ''}{formatTime(entry.position)} / {formatTime(entry.duration)}</span>
              </div>
            )}
            {item.genres && item.genres.length > 0 && (
              <div className="hover-genres">
                {item.genres.slice(0, 3).map((g) => <span key={g}>{GENRE_FR[g] || g}</span>)}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
