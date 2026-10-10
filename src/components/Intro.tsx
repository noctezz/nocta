import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Logo } from './Logo';
import { playIntroSound } from '../lib/sound';
import { useStore } from '../lib/store';

let soundPlayed = false;

const RIBBON_COLORS = ['#ff3b5c', '#e50f3a', '#ff7a18', '#ffd166', '#7f5af0', '#00c2ff', '#ff2e93', '#b5001f', '#ffffff'];

/** Séquence d'intro : ta-doum + logo + explosion de rubans lumineux */
export function Intro({ onDone }: { onDone: () => void }) {
  const sound = useStore((s) => s.settings.introSound);
  const ribbons = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({
      x: (i / 34) * 100 + (Math.random() * 1.5 - 0.75),
      w: 0.6 + Math.random() * 2.4,
      color: RIBBON_COLORS[Math.floor(Math.random() * RIBBON_COLORS.length)],
      delay: Math.random() * 0.35,
    })),
    [],
  );

  useEffect(() => {
    if (sound && !soundPlayed) { soundPlayed = true; playIntroSound(); }
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone, sound]);

  return (
    <motion.div className="intro" onClick={onDone} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <motion.div
        className="intro-logo"
        initial={{ scale: 1.25, opacity: 0, filter: 'blur(14px)' }}
        animate={{
          scale: [1.25, 1, 1.04, 2.6],
          opacity: [0, 1, 1, 0],
          filter: ['blur(14px)', 'blur(0px)', 'blur(0px)', 'blur(0px)'],
        }}
        transition={{ duration: 3, times: [0, 0.22, 0.62, 1], ease: [0.7, 0, 0.3, 1] }}
      >
        <Logo height={150} glow />
      </motion.div>

      <div className="intro-ribbons">
        {ribbons.map((r, i) => (
          <motion.span
            key={i}
            style={{ left: `${r.x}%`, width: `${r.w}%`, background: `linear-gradient(180deg, transparent, ${r.color}, transparent)` }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: [0, 1.4, 2.2], opacity: [0, 0.95, 0] }}
            transition={{ duration: 1.3, delay: 1.95 + r.delay, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        className="intro-flash"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.8, delay: 2.5 }}
      />
    </motion.div>
  );
}
