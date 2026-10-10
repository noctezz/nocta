import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Play } from 'lucide-react';
import { browsableCatalogs, getCatalog, getMeta, GENRE_FR, mainAddons } from '../lib/addons';
import { useStore } from '../lib/store';
import { backdropOf, logoOf, quickPlay, year } from '../lib/ui';
import type { Meta, MetaPreview } from '../lib/types';

/** Grande bannière "à la une" en haut des pages */
export function Hero({ type }: { type?: string }) {
  const addons = useStore((s) => s.addons);
  const openDetail = useStore((s) => s.openDetail);
  const [item, setItem] = useState<(Meta | MetaPreview) | null>(null);
  const [logoOk, setLogoOk] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setItem(null);
    setImgLoaded(false);
    (async () => {
      const cats = browsableCatalogs(mainAddons(addons), type);
      for (const { addon, catalog } of cats.slice(0, 3)) {
        try {
          const list = (await getCatalog(addon, catalog.type, catalog.id)).slice(0, 12);
          const candidates = list.filter((m) => backdropOf(m));
          if (!candidates.length) continue;
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          if (!alive) return;
          setItem(pick);
          setLogoOk(true);
          const full = await getMeta(addons, pick.type, pick.id);
          if (alive && full) setItem({ ...pick, ...full });
          return;
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [addons, type]);

  const logo = item ? logoOf(item) : undefined;

  return (
    <div className="hero">
      <AnimatePresence>
        {item && (
          <motion.div
            key={item.id}
            className="hero-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: imgLoaded ? 1 : 0 }}
            transition={{ duration: 1.2 }}
          >
            <img src={backdropOf(item)} alt="" onLoad={() => setImgLoaded(true)} draggable={false} />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="hero-vignette" />

      {item && (
        <motion.div
          className="hero-content"
          key={item.id + 'c'}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {logo && logoOk ? (
            <img className="hero-logo" src={logo} alt={item.name} onError={() => setLogoOk(false)} />
          ) : (
            <h1 className="hero-title">{item.name}</h1>
          )}
          <div className="hero-meta">
            <span className="hero-kind">{item.type === 'series' ? 'S É R I E' : 'F I L M'}</span>
            {item.imdbRating && <span className="match">★ {item.imdbRating}</span>}
            {year(item) && <span>{year(item)}</span>}
            {item.genres?.slice(0, 3).map((g) => <span key={g} className="dot">{GENRE_FR[g] || g}</span>)}
          </div>
          {item.description && <p className="hero-desc">{item.description}</p>}
          <div className="hero-actions">
            <button className="btn btn-white btn-lg" data-nav-default onClick={() => quickPlay(item)}>
              <Play size={26} fill="currentColor" /> Lecture
            </button>
            <button className="btn btn-glass btn-lg" onClick={() => openDetail({ type: item.type, id: item.id, preview: item })}>
              <Info size={26} /> Plus d'infos
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
