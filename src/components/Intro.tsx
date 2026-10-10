import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Logo } from './Logo';
import { SeasonalLayer } from './SeasonalLayer';
import { playIntroSound } from '../lib/sound';
import { useStore } from '../lib/store';
import { useSeasonTheme, type SeasonTheme } from '../lib/theme';

let soundPlayed = false;

const RIBBON_COLORS: Record<SeasonTheme, string[]> = {
  none: ['#ff3b5c', '#e50f3a', '#ff7a18', '#ffd166', '#7f5af0', '#00c2ff', '#ff2e93', '#b5001f', '#ffffff'],
  halloween: ['#ff7a18', '#ff9f1c', '#ffb347', '#7b2cbf', '#5a189a', '#9d4edd', '#c1121f', '#3c096c', '#ffd27a'],
  christmas: ['#e0102f', '#ff4d5e', '#1b7f3b', '#2dc653', '#ffd166', '#f4d58d', '#ffffff', '#b5001f', '#0f5132'],
};

const TAGLINE: Record<SeasonTheme, string> = { none: '', halloween: 'Joyeux Halloween', christmas: 'Joyeuses fêtes' };

/** Séquence d'intro : ta-doum + logo + explosion de rubans lumineux (version saisonnière) */
export function Intro({ onDone }: { onDone: () => void }) {
  const sound = useStore((s) => s.settings.introSound);
  const theme = useSeasonTheme();
  const ribbons = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({
      x: (i / 34) * 100 + (Math.random() * 1.5 - 0.75),
      w: 0.6 + Math.random() * 2.4,
      color: RIBBON_COLORS[theme][Math.floor(Math.random() * RIBBON_COLORS[theme].length)],
      delay: Math.random() * 0.35,
    })),
    [theme],
  );

  useEffect(() => {
    if (sound && !soundPlayed) { soundPlayed = true; playIntroSound(0.9, theme); }
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [onDone, sound, theme]);

  return (
    <motion.div className={`intro intro-${theme}`} onClick={onDone} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      {theme !== 'none' && <SeasonalLayer theme={theme} density={1.3} className="intro-season" />}
      {theme === 'halloween' && <div className="intro-fog" />}

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
        <Logo height={150} glow season={theme} />
        {TAGLINE[theme] && (
          <motion.div
            className="intro-tagline"
            initial={{ opacity: 0, y: 8, letterSpacing: '0.6em' }}
            animate={{ opacity: [0, 1, 1, 0], y: 0, letterSpacing: '0.35em' }}
            transition={{ duration: 2.2, delay: 0.5, times: [0, 0.25, 0.75, 1] }}
          >
            {TAGLINE[theme]}
          </motion.div>
        )}
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
