import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { posterOf } from '../lib/ui';
import type { MetaPreview } from '../lib/types';
import { catalog, yearOf } from './data';
import type { DetailRef } from './Detail';

/** Recherche plein écran : films et séries */
export function Search({ onClose, onOpen }: { onClose: () => void; onOpen: (d: DetailRef) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ q: string; movies: MetaPreview[]; series: MetaPreview[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === 'Escape' && !st.picker && !st.player) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Recherche lancée quand on arrête de taper
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      Promise.all([catalog('movie', 'top', { search: term }), catalog('series', 'top', { search: term })])
        .then(([movies, series]) => { if (alive) setRes({ q: term, movies, series }); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const open = (m: MetaPreview) => onOpen({ type: m.type, id: m.id, preview: m });
  const empty = res && !res.movies.length && !res.series.length;

  return (
    <motion.div className="mn-search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <button className="mn-search-close" onClick={onClose} aria-label="Fermer"><X size={22} strokeWidth={1.5} /></button>
      <input
        ref={input}
        className="mn-search-input"
        placeholder="Un film, une série…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        spellCheck={false}
      />
      {empty && <p className="mn-muted mn-search-empty">Rien trouvé pour « {res!.q} ».</p>}
      {res && ([['Films', res.movies], ['Séries', res.series]] as const).map(([label, list]) => list.length > 0 && (
        <section key={label} className="mn-results">
          <h2>{label}</h2>
          <div className="mn-grid">
            {list.slice(0, 18).map((m) => (
              <button key={m.id} className="mn-poster" onClick={() => open(m)}>
                <div className="mn-poster-img">{posterOf(m) ? <img src={posterOf(m)} alt="" loading="lazy" /> : <span>{m.name}</span>}</div>
                <strong>{m.name}</strong>
                <small>{yearOf(m)}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </motion.div>
  );
}
