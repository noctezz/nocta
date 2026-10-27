import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { useProfile } from '../lib/store';
import { backdropOf, quickPlay, resumeEntry } from '../lib/ui';
import type { MetaPreview, ProgressEntry } from '../lib/types';
import { catalog, genresOf, runtimeOf, SHELVES, yearOf, type Kind, type ShelfDef } from './data';
import type { DetailRef } from './Detail';

type Open = (d: DetailRef) => void;
const openOf = (m: MetaPreview, onOpen: Open) => () => onOpen({ type: m.type, id: m.id, preview: m });

/** Une section : Films ou Séries */
export function Section({ type, onOpen }: { type: Kind; onOpen: Open }) {
  const profile = useProfile();
  const resume = useMemo(
    () => Object.values(profile?.progress || {}).filter((e) => e.meta.type === type).sort((a, b) => b.updatedAt - a.updatedAt),
    [profile?.progress, type],
  );
  const myList = useMemo(() => (profile?.myList || []).filter((m) => m.type === type), [profile?.myList, type]);

  return (
    <>
      <Feature type={type} onOpen={onOpen} />
      <div className="mn-shelves">
        {resume.length > 0 && <Shelf title="Reprendre" items={resume.map((e) => e.meta)} entries={resume} onOpen={onOpen} />}
        {myList.length > 0 && <Shelf title="Ma liste" items={myList} onOpen={onOpen} />}
        {SHELVES[type].map((s) => <LazyShelf key={s.key} def={s} onOpen={onOpen} />)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- À la une

function Feature({ type, onOpen }: { type: Kind; onOpen: Open }) {
  const [m, setM] = useState<MetaPreview | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Un titre parmi les plus regardés du moment, différent à chaque ouverture
  useEffect(() => {
    let alive = true;
    catalog(type, 'top').then((list) => {
      const pool = list.filter((x) => backdropOf(x) && x.description).slice(0, 8);
      if (alive && pool.length) setM(pool[Math.floor(Math.random() * pool.length)]);
    });
    return () => { alive = false; };
  }, [type]);

  return (
    <section className="mn-feature">
      {m && (
        <motion.img
          key={m.id}
          className="mn-feature-img"
          src={backdropOf(m)}
          alt=""
          onLoad={() => setLoaded(true)}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: loaded ? 1 : 0, scale: loaded ? 1 : 1.04 }}
          transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
        />
      )}
      <div className="mn-feature-shade" />
      {m && (
        <motion.div className="mn-feature-text" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
          <span className="mn-kicker">{type === 'movie' ? 'Film' : 'Série'} à la une</span>
          <h1>{m.name}</h1>
          <p className="mn-meta">{[yearOf(m), runtimeOf(m), ...genresOf(m)].filter(Boolean).join('  ·  ')}</p>
          {m.description && <p className="mn-feature-desc">{m.description}</p>}
          <div className="mn-actions">
            <button className="mn-btn mn-btn-light" onClick={() => quickPlay(m)}><Play size={17} fill="currentColor" /> Lecture</button>
            <button className="mn-btn mn-btn-ghost" onClick={openOf(m, onOpen)}>Plus d'infos</button>
          </div>
        </motion.div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Rangées

/** Rangée chargée quand on approche de l'écran ; cachée si le catalogue est vide */
function LazyShelf({ def, onOpen }: { def: ShelfDef; onOpen: Open }) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<MetaPreview[] | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      def.load().then((r) => { if (alive) setItems(r.slice(0, 24)); });
    }, { rootMargin: '500px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [def]);
  if (items && !items.length) return null;
  return <div ref={ref}><Shelf title={def.title} items={items} onOpen={onOpen} /></div>;
}

function Shelf({ title, items, entries, onOpen }: { title: string; items: MetaPreview[] | null; entries?: ProgressEntry[]; onOpen: Open }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });
  const update = () => {
    const t = track.current;
    if (!t) return;
    setEdges({ left: t.scrollLeft > 8, right: t.scrollLeft + t.clientWidth < t.scrollWidth - 8 });
  };
  useEffect(update, [items]);
  const scroll = (d: number) => track.current?.scrollBy({ left: d * track.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <section className="mn-shelf">
      <h2>{title}</h2>
      <div className="mn-shelf-view">
        {edges.left && <button className="mn-arrow is-left" onClick={() => scroll(-1)} aria-label="Précédent"><ChevronLeft size={26} strokeWidth={1.5} /></button>}
        <div className="mn-track" ref={track} onScroll={update}>
          {items
            ? items.map((m, i) => <Card key={m.id} m={m} entry={entries?.[i]} onOpen={onOpen} />)
            : Array.from({ length: 6 }, (_, i) => <div key={i} className="mn-card is-ghost"><div className="mn-card-img" /></div>)}
        </div>
        {edges.right && items && items.length > 3 && <button className="mn-arrow is-right" onClick={() => scroll(1)} aria-label="Suivant"><ChevronRight size={26} strokeWidth={1.5} /></button>}
      </div>
    </section>
  );
}

function Card({ m, entry, onOpen }: { m: MetaPreview; entry?: ProgressEntry; onOpen: Open }) {
  const [ok, setOk] = useState(true);
  const [ready, setReady] = useState(false);
  const pct = entry && entry.duration ? Math.min(100, (entry.position / entry.duration) * 100) : 0;
  const sub = entry
    ? entry.season ? entry.episodeTitle || `S${entry.season} · É${entry.episode}` : `${Math.max(1, Math.round((entry.duration - entry.position) / 60))} min restantes`
    : yearOf(m);
  return (
    <button className="mn-card" onClick={entry ? () => resumeEntry(entry) : openOf(m, onOpen)} title={m.name}>
      <div className="mn-card-img">
        {ok && backdropOf(m)
          ? <img src={backdropOf(m)} alt="" loading="lazy" decoding="async" className={ready ? 'is-ready' : ''} onLoad={() => setReady(true)} onError={() => setOk(false)} />
          : <span className="mn-card-fallback">{m.name}</span>}
        {entry && <span className="mn-card-play"><Play size={18} fill="currentColor" /></span>}
        {pct > 0 && <div className="mn-card-bar"><div style={{ width: `${pct}%` }} /></div>}
      </div>
      <strong>{m.name}</strong>
      {sub && <small>{sub}</small>}
    </button>
  );
}
