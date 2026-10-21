import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, Loader2, Orbit, Plane, Search, Sparkles, Star } from 'lucide-react';
import { loadGalaxy, MY_PLANET, myTitles, type Nebula } from '../lib/galaxy';
import { GalaxyScene } from '../lib/galaxyScene';
import { useProfile, useStore } from '../lib/store';
import type { MetaPreview } from '../lib/types';

/**
 * La Galaxie : tout le catalogue en 3D. Chaque genre est une nébuleuse, chaque titre une
 * affiche qui flotte dedans ; tes titres (en cours, Ma liste) brillent en or et sont reliés
 * en constellation. On vole dedans à la souris, on clique sur une affiche pour l'ouvrir.
 */
export function Galaxy() {
  const addons = useStore((s) => s.addons);
  const openDetail = useStore((s) => s.openDetail);
  const blocked = useStore((s) => !!(s.detail || s.picker || s.player));
  const profile = useProfile();
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<GalaxyScene | null>(null);
  const [nebulae, setNebulae] = useState<Nebula[] | null>(null);
  /** Planètes telles qu'affichées (ta planète comprise), dans le même ordre que la scène */
  const [system, setSystem] = useState<Nebula[]>([]);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<{ meta: MetaPreview; neb?: Nebula } | null>(null);
  const [near, setNear] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [query, setQuery] = useState('');
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const mine = useMemo(() => myTitles(profile), [profile]);

  useEffect(() => {
    loadGalaxy(addons).then(setNebulae).catch(() => setError('Impossible de charger le catalogue pour le moment.'));
  }, [addons]);

  // Création de la scène quand les données sont là
  useEffect(() => {
    if (!nebulae || !canvas.current || !overlay.current) return;
    // Ta planète dorée (tes titres) en premier ; ces titres quittent les planètes de genre
    const mineIds = new Set(mine.map((m) => m.id));
    const planets: Nebula[] = [
      ...(mine.length ? [{ ...MY_PLANET, stars: mine.filter((m) => m.poster) }] : []),
      ...nebulae.map((n) => ({ ...n, stars: n.stars.filter((x) => !mineIds.has(x.id)) })),
    ];
    setSystem(planets);
    const s = new GalaxyScene(canvas.current, overlay.current, planets, mine, {
      onHover: (meta, neb) => setHover(meta ? { meta, neb } : null),
      onPick: (meta) => openDetail({ type: meta.type, id: meta.id, preview: meta }),
      onNear: (l) => setNear((prev) => (prev === l ? prev : l)),
    });
    scene.current = s;
    return () => { s.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nebulae]);

  // Fiche ouverte ou film lancé : la galaxie se met en veille
  useEffect(() => { scene.current?.setPaused(blocked); }, [blocked]);

  const all = useMemo(() => system.flatMap((n) => n.stars.map((s) => ({ s, n }))), [system]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return all.filter(({ s }) => (s.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [query, all]);
  const count = all.length;

  return (
    <div className="galaxy" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
      <canvas ref={canvas} className="gx-canvas" />
      <div ref={overlay} className="gx-labels" />

      {!nebulae && !error && (
        <div className="gx-loading">
          <Loader2 size={22} className="spin" />
          <span>Formation de la galaxie…</span>
        </div>
      )}
      {error && <div className="gx-loading">{error}</div>}

      {nebulae && (
        <>
          <motion.div className="gx-hud gx-title" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}>
            <h1><Sparkles size={20} /> Système NOCTA</h1>
            <p>{count} titres · {system.length} planètes{mine.length ? ` · ta planète : ${mine.length} titres` : ''}</p>
            <AnimatePresence>{near && <motion.span className="gx-near" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Planète <b>{near}</b></motion.span>}</AnimatePresence>
          </motion.div>

          <motion.div className="gx-hud gx-search" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.2 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rejoindre un titre…" onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) { scene.current?.focusStar(results[0].s.id); setQuery(''); }
            }} />
            {results.length > 0 && (
              <div className="gx-results">
                {results.map(({ s, n }) => (
                  <button key={s.id} onClick={() => { scene.current?.focusStar(s.id); setQuery(''); }}>
                    {s.poster && <img src={s.poster} alt="" />}
                    <span><strong>{s.name}</strong><small style={{ color: n.color }}>{n.label}</small></span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div className="gx-hud gx-actions" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.4 }}>
            <button onClick={() => { setAuto(false); scene.current?.overview(); }}><Orbit size={16} /> Vue d'ensemble</button>
            {mine.length > 0 && <button className="gold" onClick={() => { setAuto(false); scene.current?.showConstellation(); }}><Star size={16} /> Ta planète</button>}
            <button className={auto ? 'is-on' : ''} onClick={() => { const v = !auto; setAuto(v); scene.current?.setAutopilot(v); }}><Plane size={16} /> {auto ? 'Pilote auto…' : 'Pilote auto'}</button>
          </motion.div>

          <div className="gx-hud gx-nebulae">
            {system.map((n, i) => (
              <button key={n.genre} style={{ ['--c' as any]: n.color }} onClick={() => { setAuto(false); scene.current?.flyToNebula(i); }}>
                <i />{n.label}
              </button>
            ))}
          </div>

          <div className="gx-hint"><Compass size={13} /> Glisser pour tourner · Molette pour plonger · Clic sur une affiche pour l'ouvrir · Double-clic : vue d'ensemble</div>
        </>
      )}

      <AnimatePresence>
        {hover && (
          <motion.div
            className="gx-card"
            style={{ left: mouse.x + 18, top: mouse.y + 18, ['--c' as any]: hover.neb?.color || '#b28cff' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <strong>{hover.meta.name}</strong>
            <span>
              {[hover.meta.type === 'series' ? 'Série' : 'Film', hover.meta.releaseInfo, hover.meta.imdbRating ? `★ ${hover.meta.imdbRating}` : null].filter(Boolean).join(' · ')}
            </span>
            {mine.some((m) => m.id === hover.meta.id) && <em>✦ Sur ta planète</em>}
            <small>Clic pour ouvrir</small>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
