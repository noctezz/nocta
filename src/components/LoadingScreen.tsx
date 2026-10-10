import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import type { MetaPreview } from '../lib/types';
import { backdropOf, logoOf } from '../lib/ui';
import { useSeasonTheme } from '../lib/theme';
import { SeasonalLayer } from './SeasonalLayer';

export interface LoadingInfo {
  meta?: MetaPreview;
  title: string;
  subtitle?: string;
  status?: string;
  progress?: number;
}

/** Écran de chargement plein écran : visuel du titre, logo, épisode et progression */
export function LoadingScreen({ info, onBack, transparent }: { info: LoadingInfo; onBack?: () => void; transparent?: boolean }) {
  const [logoOk, setLogoOk] = useState(true);
  const season = useSeasonTheme();
  const bg = info.meta ? backdropOf(info.meta) : undefined;
  const logo = info.meta && logoOk ? logoOf(info.meta) : undefined;
  const hasProgress = info.progress != null && info.progress > 0;

  return (
    <motion.div
      className={`loading-screen ${transparent ? 'is-overlay' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.6 } }}
    >
      {bg && <div className="loading-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      <div className="loading-vignette" />
      <SeasonalLayer theme={season} density={0.8} className="loading-season" />

      {onBack && (
        <button className="player-btn loading-back" onClick={onBack} aria-label="Retour">
          <ArrowLeft size={34} />
        </button>
      )}

      <motion.div
        className="loading-center"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {logo ? (
          <img className="loading-logo" src={logo} alt={info.title} onError={() => setLogoOk(false)} />
        ) : (
          <h1 className="loading-title">{info.title}</h1>
        )}
        {info.subtitle && <p className="loading-sub">{info.subtitle}</p>}

        <div className="loading-bar">
          {hasProgress
            ? <div className="loading-bar-fill" style={{ width: `${Math.min(100, info.progress!)}%` }} />
            : <div className="loading-bar-indeterminate" />}
        </div>
        <p className="loading-status">
          {info.status || 'Chargement…'}
          {hasProgress && <span> · {Math.round(info.progress!)} %</span>}
        </p>
      </motion.div>
    </motion.div>
  );
}
