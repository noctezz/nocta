import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, Pause, Rewind, FastForward, Volume2, VolumeX } from 'lucide-react';
import { eraOf, ERAS, FIRST_YEAR, LAST_YEAR, loadYear } from '../lib/timeMachine';
import { TimeScene } from '../lib/timeScene';
import { useStore } from '../lib/store';
import type { MetaPreview } from '../lib/types';

/**
 * Machine à remonter le temps : on vole dans un tunnel à travers l'histoire du cinéma, année
 * par année. Chaque époque a son allure (muet, Technicolor, néons, VHS…) ; un clic sur une
 * affiche ouvre sa fiche.
 */
export function TimeMachine() {
  const addons = useStore((s) => s.addons);
  const openDetail = useStore((s) => s.openDetail);
  const blocked = useStore((s) => !!(s.detail || s.picker || s.player));
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<TimeScene | null>(null);
  const [year, setYear] = useState(LAST_YEAR);
  const [hover, setHover] = useState<MetaPreview | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [auto, setAuto] = useState(0);
  const [sound, setSound] = useState(true);
  const [preview, setPreview] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new TimeScene(canvas.current, {
      onYear: setYear,
      onHover: setHover,
      onPick: (m) => openDetail({ type: m.type, id: m.id, preview: m }),
      loadYear: (y) => loadYear(addons, y),
    });
    scene.current = s;
    // Arrivée : on plonge depuis aujourd'hui de quelques années en arrière
    const t = setTimeout(() => s.goTo(LAST_YEAR - 1), 600);
    return () => { clearTimeout(t); s.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addons]);

  useEffect(() => { scene.current?.setPaused(blocked); }, [blocked]);
  // Le voyage auto s'arrête tout seul aux deux bouts
  useEffect(() => { if (auto && (year <= FIRST_YEAR || year >= LAST_YEAR)) setAuto(0); }, [year, auto]);

  const era = eraOf(year);
  const pct = (y: number) => ((y - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 100;
  const decades = useMemo(() => Array.from({ length: Math.floor((LAST_YEAR - FIRST_YEAR) / 10) + 1 }, (_, i) => FIRST_YEAR + i * 10), []);
  const yearFromBar = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.round(FIRST_YEAR + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (LAST_YEAR - FIRST_YEAR));
  };
  const travel = (dir: number) => { const v = auto === dir ? 0 : dir; setAuto(v); scene.current?.setAuto(v); };

  return (
    <div className="tm" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })} style={{ ['--era' as any]: era.color }}>
      <canvas ref={canvas} className="tm-canvas" />

      <div className="tm-brand">Machine à remonter le temps</div>
      <div className="tm-top">
        <AnimatePresence mode="popLayout">
          <motion.div key={year} className="tm-year" initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }} transition={{ duration: 0.28 }}>
            {year}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.div key={era.title} className="tm-era" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <strong>{era.title}</strong>
            <p>{era.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="tm-controls">
        <button onClick={() => scene.current?.step(-10)} title="Décennie précédente (Page préc.)"><ChevronsLeft size={18} /></button>
        <button className={auto === -1 ? 'is-on' : ''} onClick={() => travel(-1)} title="Remonter le temps tout seul">{auto === -1 ? <Pause size={16} /> : <Rewind size={16} />} Remonter le temps</button>
        <button className={auto === 1 ? 'is-on' : ''} onClick={() => travel(1)} title="Revenir vers aujourd'hui tout seul">{auto === 1 ? <Pause size={16} /> : <FastForward size={16} />} Vers aujourd'hui</button>
        <button onClick={() => scene.current?.step(10)} title="Décennie suivante (Page suiv.)"><ChevronsRight size={18} /></button>
        <button className="tm-sound" onClick={() => { const v = !sound; setSound(v); scene.current?.setSound(v); }} title={sound ? 'Couper le projecteur' : 'Son du projecteur'}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
      </div>

      <div className="tm-timeline">
        <div
          ref={bar}
          className="tm-bar"
          onMouseMove={(e) => setPreview(yearFromBar(e.clientX))}
          onMouseLeave={() => setPreview(null)}
          onClick={(e) => { setAuto(0); scene.current?.goTo(yearFromBar(e.clientX)); }}
        >
          {ERAS.map((e, i) => {
            const end = ERAS[i + 1]?.from ?? LAST_YEAR;
            return <span key={e.from} className="tm-seg" style={{ left: `${pct(e.from)}%`, width: `${pct(end) - pct(e.from)}%`, background: e.color }} />;
          })}
          {decades.map((d) => (
            <span key={d} className="tm-tick" style={{ left: `${pct(d)}%` }}><i />{d}</span>
          ))}
          <motion.span className="tm-cursor" animate={{ left: `${pct(year)}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
          {preview != null && <span className="tm-preview" style={{ left: `${pct(preview)}%` }}>{preview}</span>}
        </div>
        <div className="tm-hint">Molette pour voyager dans le temps · ← → année par année · Clic sur une affiche pour l'ouvrir</div>
      </div>

      <AnimatePresence>
        {hover && (
          <motion.div className="tm-card" style={{ left: mouse.x + 18, top: mouse.y + 18 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <strong>{hover.name}</strong>
            <span>{[hover.type === 'series' ? 'Série' : 'Film', hover.releaseInfo, hover.imdbRating ? `★ ${hover.imdbRating}` : null].filter(Boolean).join(' · ')}</span>
            <small>Clic pour ouvrir</small>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
