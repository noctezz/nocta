import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { IS_TV, cardImg, cardImgFailed } from '../lib/tv';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Info, MonitorPlay, Play, Puzzle } from 'lucide-react';
import { create } from 'zustand';
import { Row } from '../components/Row';
import { browsableCatalogs, getCatalog, getFullCatalog, getMeta, GENRE_FR, typeLabel } from '../lib/addons';
import { useStore } from '../lib/store';
import { backdropOf, logoOf, posterOf, quickPlay, year } from '../lib/ui';
import type { InstalledAddon, Meta, MetaPreview } from '../lib/types';
import type { RowDef } from './Home';
import {
  firstPages, interleave, otherCatalogAddons, pageable, pageOf, platformsOf, type Platform,
} from '../lib/platforms';

/** Plateforme ouverte (gardée quand on ouvre une fiche ou « Tout voir ») */
const usePlatformView = create<{ open: string | null; filter: 'all' | 'movie' | 'series' }>(() => ({ open: null, filter: 'all' }));

const brand = (p: Platform) => ({ '--pf': p.color, '--pf-bg': p.bg } as CSSProperties);

const openPlatform = (id: string | null) => {
  usePlatformView.setState({ open: id, filter: 'all' });
  window.scrollTo({ top: 0 });
};

/** Le nom de la plateforme, à la manière de son logo */
export function Wordmark({ p, size = 'md' }: { p: Platform; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`pf-mark ${p.mark} pf-mark-${size}`}>{p.name}</span>;
}

/** Onglet Plateformes : Netflix, Disney+… (addon Streaming Catalogs), puis les autres catalogues */
export function Catalogs() {
  const addons = useStore((s) => s.addons);
  const open = usePlatformView((s) => s.open);
  const platforms = useMemo(() => platformsOf(addons), [addons]);
  const current = platforms.find((p) => p.id === open);
  return (
    <AnimatePresence mode="wait">
      {current
        ? <PlatformPage key={current.id} p={current} />
        : <PlatformIndex key="index" platforms={platforms} addons={addons} />}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- Toutes les plateformes

function PlatformIndex({ platforms, addons }: { platforms: Platform[]; addons: InstalledAddon[] }) {
  const setPage = useStore((s) => s.setPage);
  const others = useMemo(() => otherCatalogAddons(addons), [addons]);

  return (
    <motion.div className="page pf-index" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <header className="pf-index-head">
        <span className="pf-kicker">Plateformes</span>
        <h1>Tout ton streaming,<br />au même endroit.</h1>
        <p>Les catalogues de tes plateformes, à jour, lancés directement dans NOCTA.</p>
      </header>

      {platforms.length === 0 ? (
        <div className="pf-empty">
          <MonitorPlay size={44} />
          <h3>Aucune plateforme pour l'instant</h3>
          <p>Installe l'addon <strong>Streaming Catalogs</strong> (Addons → Découvrir), choisis la France et coche tes plateformes : elles apparaîtront ici.</p>
          <button className="btn btn-white" onClick={() => setPage('addons')}>Ouvrir les addons</button>
        </div>
      ) : (
        <div className="pf-tiles">
          {/* TV : seulement des lignes complètes de 3 grandes cartes ; les autres plateformes restent
              accessibles par leur rangée « À l'affiche sur… » plus bas */}
          {(IS_TV && platforms.length > 3 ? platforms.slice(0, platforms.length - (platforms.length % 3)) : platforms)
            .map((p, i) => <PlatformTile key={p.id} p={p} i={i} />)}
        </div>
      )}

      <div className="pf-index-rows">
        {platforms.map((p) => <LatestRow key={p.id} p={p} />)}
      </div>

      {others.map((addon) => <OtherAddon key={addon.url} addon={addon} />)}
    </motion.div>
  );
}

/** Les premiers titres d'une plateforme (films et séries mélangés) */
function useMix(p: Platform) {
  const [items, setItems] = useState<MetaPreview[] | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([pageOf(p, 'movie').catch(() => []), pageOf(p, 'series').catch(() => [])])
      .then(([m, s]) => alive && setItems(interleave(m, s)));
    return () => { alive = false; };
  }, [p]);
  return items;
}

function PlatformTile({ p, i }: { p: Platform; i: number }) {
  const items = useMix(p);
  const posters = (items || []).filter((m) => posterOf(m)).slice(0, 3);
  const counts = [p.movie && 'Films', p.series && 'Séries'].filter(Boolean).join(' · ');
  return (
    <motion.button
      className="pf-tile"
      style={brand(p)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.05, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      onClick={() => openPlatform(p.id)}
    >
      <div className="pf-tile-posters">
        {posters.map((m, k) => <img key={m.id} src={cardImg(posterOf(m))} onError={(e) => cardImgFailed(e.currentTarget, posterOf(m))} alt="" style={{ ['--k' as string]: k }} loading="lazy" draggable={false} />)}
      </div>
      <div className="pf-tile-shade" />
      <div className="pf-tile-body">
        <Wordmark p={p} />
        <span className="pf-tile-sub">{counts}</span>
      </div>
      <span className="pf-tile-go"><ChevronRight size={20} /></span>
    </motion.button>
  );
}

function LatestRow({ p }: { p: Platform }) {
  const items = useMix(p);
  if (items && !items.length) return null;
  return (
    <div className="pf-latest" style={brand(p)}>
      <Row
        title={`À l'affiche sur ${p.name}`}
        items={items ?? undefined}
        action={<button className="pf-row-more" onClick={() => openPlatform(p.id)}>Ouvrir {p.name} <ChevronRight size={15} /></button>}
      />
    </div>
  );
}

function OtherAddon({ addon }: { addon: InstalledAddon }) {
  const [ok, setOk] = useState(true);
  const rows = useMemo(() => browsableCatalogs([addon]).map(({ catalog }): RowDef => ({
    key: `cat|${addon.url}|${catalog.type}|${catalog.id}`,
    title: catalog.name ? `${catalog.name}${catalog.name.toLowerCase().includes(typeLabel(catalog.type).toLowerCase()) ? '' : ` · ${typeLabel(catalog.type)}`}` : typeLabel(catalog.type),
    load: () => getCatalog(addon, catalog.type, catalog.id),
    pageable: false,
    loadAll: () => getFullCatalog(addon, catalog),
  })), [addon]);
  return (
    <section className="catalogs-group">
      <div className="catalogs-addon-head">
        <div className="addon-logo small">
          {addon.manifest.logo && ok ? <img src={addon.manifest.logo} alt="" onError={() => setOk(false)} /> : <Puzzle size={18} />}
        </div>
        <h2>{addon.manifest.name}</h2>
      </div>
      <div className="rows">{rows.map((r) => <Row key={r.key} def={r} />)}</div>
    </section>
  );
}

// ---------------------------------------------------------------- Une plateforme

const PF_GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Crime', 'Sci-Fi', 'Fantasy', 'Horror', 'Romance', 'Animation', 'Family', 'Documentary'];
const rating = (m: MetaPreview) => parseFloat(String(m.imdbRating || '')) || 0;

function PlatformPage({ p }: { p: Platform }) {
  const filter = usePlatformView((s) => s.filter);
  const [movies, setMovies] = useState<MetaPreview[] | null>(null);
  const [series, setSeries] = useState<MetaPreview[] | null>(null);

  // Plusieurs pages de chaque catalogue : à la une, mieux notés et rangées par genre
  useEffect(() => {
    let alive = true;
    firstPages(p, 'movie').then((m) => alive && setMovies(m));
    firstPages(p, 'series').then((s) => alive && setSeries(s));
    return () => { alive = false; };
  }, [p]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === 'Escape' && !st.detail && !st.picker && !st.player) openPlatform(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const featured = useMemo(() => interleave(movies || [], series || []).filter((m) => backdropOf(m)).slice(0, 8), [movies, series]);

  const rows = useMemo(() => {
    const out: { key: string; def?: RowDef; title?: string; items?: MetaPreview[]; top?: boolean; type: 'movie' | 'series' }[] = [];
    const add = (type: 'movie' | 'series', list: MetaPreview[] | null) => {
      if (!(type === 'movie' ? p.movie : p.series)) return;
      const label = type === 'movie' ? 'Films' : 'Séries';
      out.push({
        key: `${p.id}|${type}`,
        type,
        def: {
          key: `pf|${p.id}|${type}`,
          title: `${label} sur ${p.name}`,
          load: (skip = 0) => pageOf(p, type, skip),
          pageable: pageable(p, type),
        },
      });
      if (!list) return;
      const rated = list.filter((m) => rating(m) > 0);
      if (rated.length >= 10) {
        out.push({ key: `${p.id}|${type}|top`, type, top: true, title: `Top 10 des ${label.toLowerCase()} les mieux notés`, items: [...rated].sort((a, b) => rating(b) - rating(a)).slice(0, 10) });
      }
    };
    add('movie', movies);
    add('series', series);
    // Rangées par genre : films et séries ensemble, ou seulement ceux du filtre choisi
    const all = filter === 'movie' ? movies || [] : filter === 'series' ? series || [] : interleave(movies || [], series || []);
    let genres = 0;
    for (const g of PF_GENRES) {
      // Sur la TV, quelques rangées par genre seulement (chacune coûte des dizaines d'images)
      if (IS_TV && genres >= 5) break;
      const items = all.filter((m) => m.genres?.includes(g));
      if (items.length < 8) continue;
      genres++;
      out.push({ key: `${p.id}|g|${filter}|${g}`, type: filter === 'series' ? 'series' : 'movie', title: GENRE_FR[g] || g, items });
    }
    return out;
  }, [p, movies, series, filter]);

  const shown = rows.filter((r) => filter === 'all' || r.key.includes('|g|') || r.type === filter);
  const both = !!p.movie && !!p.series;

  return (
    <motion.div className="page pf-page" style={brand(p)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="pf-page-glow" />
      <PlatformHero p={p} items={featured} />

      <div className="pf-bar">
        <button className="pf-back" onClick={() => openPlatform(null)}><ArrowLeft size={17} /> Plateformes</button>
        {both && (
          <div className="pf-filter">
            {(['all', 'movie', 'series'] as const).map((f) => (
              <button key={f} className={filter === f ? 'is-on' : ''} onClick={() => usePlatformView.setState({ filter: f })}>
                {f === 'all' ? 'Tout' : f === 'movie' ? 'Films' : 'Séries'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rows pf-rows">
        {shown.map((r) => r.def
          ? <Row key={r.key} def={r.def} />
          : <Row key={r.key} title={r.title} items={r.items} variant={r.top ? 'top10' : undefined} />)}
      </div>
    </motion.div>
  );
}

/** Le grand bandeau : les titres phares de la plateforme défilent */
function PlatformHero({ p, items }: { p: Platform; items: MetaPreview[] }) {
  const addons = useStore((s) => s.addons);
  const openDetail = useStore((s) => s.openDetail);
  const [n, setN] = useState(0);
  const [full, setFull] = useState<Record<string, Meta>>({});
  const [logoFail, setLogoFail] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (items.length < 2 || IS_TV) return;
    const t = setInterval(() => setN((x) => x + 1), 9000);
    return () => clearInterval(t);
  }, [items.length, n]);

  const item = items.length ? items[n % items.length] : null;

  // Résumé, note et genres complets du titre affiché
  useEffect(() => {
    if (!item || full[item.id]) return;
    let alive = true;
    getMeta(addons, item.type, item.id).then((m) => { if (alive && m) setFull((x) => ({ ...x, [item.id]: m })); }).catch(() => {});
    return () => { alive = false; };
  }, [item?.id]);

  const m: MetaPreview | null = item ? { ...item, ...(full[item.id] || {}) } : null;
  const logo = m ? logoOf(m) : undefined;

  return (
    <div className="pf-hero">
      <AnimatePresence>
        {m && (
          <motion.img
            key={m.id}
            className="pf-hero-img"
            src={backdropOf(m)}
            alt=""
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.1 }, scale: { duration: 10, ease: 'linear' } }}
            draggable={false}
          />
        )}
      </AnimatePresence>
      <div className="pf-hero-shade" />

      <div className="pf-hero-brand"><Wordmark p={p} size="lg" /></div>

      <AnimatePresence mode="wait">
        {m && (
          <motion.div key={m.id} className="pf-hero-text" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.55 }}>
            {logo && !logoFail[m.id]
              ? <img className="pf-hero-logo" src={logo} alt={m.name} onError={() => setLogoFail((x) => ({ ...x, [m.id]: true }))} />
              : <h1>{m.name}</h1>}
            <div className="hero-meta">
              <span className="hero-kind">{m.type === 'series' ? 'S É R I E' : 'F I L M'}</span>
              {m.imdbRating && <span className="match">★ {m.imdbRating}</span>}
              {year(m) && <span>{year(m)}</span>}
              {m.genres?.slice(0, 3).map((g) => <span key={g} className="dot">{GENRE_FR[g] || g}</span>)}
            </div>
            {m.description && <p className="pf-hero-desc">{m.description}</p>}
            <div className="hero-actions">
              <button className="btn btn-white btn-lg" onClick={() => quickPlay(m)}><Play size={24} fill="currentColor" /> Lecture</button>
              <button className="btn btn-glass btn-lg" onClick={() => openDetail({ type: m.type, id: m.id, preview: m })}><Info size={24} /> Plus d'infos</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length > 1 && (
        <div className="pf-hero-thumbs">
          {items.map((x, i) => (
            <button key={x.id} className={i === n % items.length ? 'is-on' : ''} onClick={() => setN(i)} title={x.name}>
              <img src={cardImg(posterOf(x))} onError={(e) => cardImgFailed(e.currentTarget, posterOf(x))} alt="" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
