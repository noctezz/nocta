import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Info, Pencil, Play, Search as SearchIcon, Star, X } from 'lucide-react';
import { create } from 'zustand';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, posterOf, resumeEntry } from '../lib/ui';
import { playTarget } from '../lib/autoplay';
import type { MetaPreview } from '../lib/types';
import {
  SAGAS, SAGA_CATS, coverOf, ensureSaga, filmKey, filmLabel, filmOf, isSeen, nextOf, nextStep, orderOf, sagaById, sagaProgress,
  searchFilms, setFilm, useSagaFilms, yearsOf, type SagaDef,
} from '../lib/sagas';

const CHRONO_KEY = 'nocta-sagas-chrono';
const loadChrono = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(CHRONO_KEY) || '{}') || {}; } catch { return {}; }
};

/** Ce qui reste affiché quand on ouvre une fiche ou qu'on change d'onglet */
const useSagaView = create<{ open: string | null; cat: string; chrono: Record<string, boolean> }>(() => ({
  open: null, cat: 'all', chrono: loadChrono(),
}));

const setChrono = (id: string, on: boolean) => {
  const chrono = { ...useSagaView.getState().chrono, [id]: on };
  useSagaView.setState({ chrono });
  try { localStorage.setItem(CHRONO_KEY, JSON.stringify(chrono)); } catch {}
};

const FEATURED = ['starwars', 'mcu', 'wizarding', 'middleearth', 'bond', 'matrix', 'fast', 'jurassic', 'indy', 'johnwick', 'dune', 'alien'];

const accent = (s: SagaDef) => ({ '--sg': s.color } as CSSProperties);

/** Lance le film : reprise s'il est commencé, sinon la liste des sources */
function playFilm(m: MetaPreview) {
  const p = useStore.getState().profiles.find((x) => x.id === useStore.getState().activeProfileId);
  const e = p?.progress[m.id];
  if (e?.stream && !isSeen(p || null, m.id)) resumeEntry(e);
  else playTarget({ meta: m, type: 'movie', videoId: m.id });
}

export function Sagas() {
  const open = useSagaView((s) => s.open);
  const saga = open ? sagaById(open) : null;
  return (
    <AnimatePresence mode="wait">
      {saga ? <SagaView key={saga.id} saga={saga} /> : <SagaIndex key="index" />}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- Liste des sagas

function SagaIndex() {
  const hits = useSagaFilms((s) => s.hits);
  const profile = useProfile();
  const cat = useSagaView((s) => s.cat);
  const [query, setQuery] = useState('');

  // Couvertures d'abord (les mises en avant en premier), puis les sagas déjà commencées en entier
  useEffect(() => {
    const first = [...FEATURED.map(sagaById).filter(Boolean) as SagaDef[], ...SAGAS];
    first.forEach((s) => ensureSaga(s, false));
  }, []);

  const started = useMemo(() => SAGAS.filter((s) => {
    const { seen, total } = sagaProgress(profile, hits, s);
    return seen > 0 && seen < total;
  }), [profile, hits]);

  const q = query.trim().toLowerCase();
  const shown = SAGAS.filter((s) =>
    (cat === 'all' || (cat === 'started' ? started.includes(s) : s.cat === cat)) &&
    (!q || s.name.toLowerCase().includes(q) || s.films.some((f) => f[0].toLowerCase().includes(q))));

  const groups = cat === 'all' && !q
    ? SAGA_CATS.map((c) => ({ ...c, items: shown.filter((s) => s.cat === c.id) }))
    : [{ id: cat, label: '', items: shown }];

  return (
    <motion.div className="page sg-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <SagaHero />

      <div className="sg-index">
        {started.length > 0 && cat === 'all' && !q && (
          <section className="sg-group">
            <h2>Tes sagas en cours</h2>
            <div className="sg-grid">
              {started.map((s, i) => <SagaCard key={s.id} saga={s} i={i} showNext />)}
            </div>
          </section>
        )}

        <div className="sg-filters">
          <div className="sg-chips">
            <button className={cat === 'all' ? 'is-on' : ''} onClick={() => useSagaView.setState({ cat: 'all' })}>Toutes <em>{SAGAS.length}</em></button>
            {started.length > 0 && (
              <button className={cat === 'started' ? 'is-on' : ''} onClick={() => useSagaView.setState({ cat: 'started' })}>En cours <em>{started.length}</em></button>
            )}
            {SAGA_CATS.map((c) => (
              <button key={c.id} className={cat === c.id ? 'is-on' : ''} onClick={() => useSagaView.setState({ cat: c.id })}>{c.label}</button>
            ))}
          </div>
          <label className="sg-search">
            <SearchIcon size={16} />
            <input placeholder="Une saga, un film…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        {shown.length === 0 && <div className="empty"><h3>Aucune saga pour « {query} »</h3></div>}
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.id} className="sg-group">
            {g.label && <h2>{g.label} <span>{g.items.length}</span></h2>}
            <div className="sg-grid">
              {g.items.map((s, i) => <SagaCard key={s.id} saga={s} i={i} />)}
            </div>
          </section>
        ))}
      </div>
    </motion.div>
  );
}

/** Les grandes sagas défilent en haut de la page */
function SagaHero() {
  const hits = useSagaFilms((s) => s.hits);
  const ready = FEATURED.map(sagaById).filter((s): s is SagaDef => !!s && !!coverOf(hits, s));
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), 8000);
    return () => clearInterval(t);
  }, []);
  if (!ready.length) return <div className="sg-hero is-empty" />;
  const s = ready[n % ready.length];
  const cover = coverOf(hits, s)!;
  return (
    <div className="sg-hero" style={accent(s)}>
      <AnimatePresence>
        <motion.img
          key={s.id}
          className="sg-hero-img"
          src={backdropOf(cover)}
          alt=""
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.2 }, scale: { duration: 9, ease: 'linear' } }}
        />
      </AnimatePresence>
      <div className="sg-hero-shade" />
      <AnimatePresence mode="wait">
        <motion.div key={s.id} className="sg-hero-text" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.6 }}>
          <span className="sg-kicker">Sagas</span>
          <h1>{s.name}</h1>
          <p>{s.tagline}</p>
          <div className="sg-hero-meta">{s.films.length} films · {yearsOf(s)}{s.chrono ? ' · ordre chronologique disponible' : ''}</div>
          <button className="btn btn-white btn-lg" onClick={() => { useSagaView.setState({ open: s.id }); window.scrollTo({ top: 0 }); }}>
            <Play size={22} fill="currentColor" /> Explorer la saga
          </button>
        </motion.div>
      </AnimatePresence>
      <div className="sg-hero-dots">
        {ready.map((x, i) => (
          <button key={x.id} className={i === n % ready.length ? 'is-on' : ''} onClick={() => setN(i)} aria-label={x.name} />
        ))}
      </div>
    </div>
  );
}

function SagaCard({ saga, i, showNext }: { saga: SagaDef; i: number; showNext?: boolean }) {
  const hits = useSagaFilms((s) => s.hits);
  const profile = useProfile();
  const chrono = useSagaView((s) => !!s.chrono[saga.id]);
  const cover = coverOf(hits, saga);
  const [ok, setOk] = useState(true);
  const { seen, total } = sagaProgress(profile, hits, saga);
  const next = showNext ? nextOf(profile, hits, saga, chrono) : null;
  return (
    <motion.button
      className="sg-card"
      style={accent(saga)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.03, 0.4) }}
      onClick={() => { useSagaView.setState({ open: saga.id }); window.scrollTo({ top: 0 }); }}
    >
      <div className="sg-card-img">
        {cover && ok ? <img src={backdropOf(cover)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setOk(false)} /> : <div className="sg-card-blank" />}
      </div>
      <div className="sg-card-shade" />
      <div className="sg-card-body">
        <span className="sg-card-count">{total} films · {yearsOf(saga)}</span>
        <h3>{saga.name}</h3>
        {next && <span className="sg-card-next">Ensuite : {next.name}</span>}
      </div>
      {seen > 0 && (
        <>
          <span className="sg-card-badge">{seen === total ? <><Check size={13} /> Terminée</> : `${seen}/${total}`}</span>
          <div className="sg-card-bar"><div style={{ width: `${(seen / total) * 100}%` }} /></div>
        </>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------- Une saga

function SagaView({ saga }: { saga: SagaDef }) {
  const hits = useSagaFilms((s) => s.hits);
  const profile = useProfile();
  const chrono = useSagaView((s) => !!s.chrono[saga.id] && !!saga.chrono);
  const openDetail = useStore((s) => s.openDetail);
  const [hover, setHover] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureSaga(saga, true); }, [saga]);

  const back = () => { useSagaView.setState({ open: null }); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === 'Escape' && !st.detail && !st.picker && !st.player) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Molette : la frise défile de côté
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 1.4, behavior: 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const films = orderOf(saga, chrono);
  const { seen, total } = sagaProgress(profile, hits, saga);
  const step = nextStep(profile, hits, saga, chrono);
  const next = step?.m || null;
  const [fix, setFix] = useState<[string, number] | null>(null);
  const allFound = saga.films.every((f) => filmOf(hits, f) !== undefined);
  const focusFilm = (hover && films.map((f) => filmOf(hits, f)).find((m) => m?.id === hover)) || next || coverOf(hits, saga);
  const cover = coverOf(hits, saga);
  const bg = focusFilm || cover;
  const first = films.map((f) => filmOf(hits, f)).find(Boolean) || null;
  const started = !!next && profile && (profile.progress[next.id] || seen > 0);

  // Le prochain film bien en vue dans la frise
  const stepKey = step ? filmKey(step.f) : '';
  useEffect(() => {
    if (!stepKey || !rail.current) return;
    const el = rail.current.querySelector<HTMLElement>(`[data-key="${CSS.escape(stepKey)}"]`);
    if (el) rail.current.scrollTo({ left: Math.max(0, el.offsetLeft - rail.current.clientWidth * 0.3), behavior: 'smooth' });
  }, [stepKey, chrono]);
  const focusKey = focusFilm && films.find((f) => filmOf(hits, f)?.id === focusFilm.id);

  return (
    <motion.div className="page sg-view" style={accent(saga)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <div className="sg-bg">
        <AnimatePresence>
          {bg && (
            <motion.img
              key={bg.id}
              src={backdropOf(bg)}
              alt=""
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9 }}
            />
          )}
        </AnimatePresence>
        <div className="sg-bg-shade" />
      </div>

      <div className="sg-view-top">
        <button className="sg-back" onClick={back}><ArrowLeft size={18} /> Toutes les sagas</button>
        <motion.h1 className={saga.name.length > 20 ? 'is-long' : ''} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }}>{saga.name}</motion.h1>
        <motion.p className="sg-tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>{saga.tagline}</motion.p>
        <div className="sg-stats">
          <span>{total} films</span><i />
          <span>{yearsOf(saga)}</span><i />
          <span className="sg-stats-seen">{seen === total && total ? 'Saga terminée ✓' : seen ? `${seen} vu${seen > 1 ? 's' : ''} sur ${total}` : 'Pas encore commencée'}</span>
        </div>
        <div className="sg-meter"><motion.div initial={{ width: 0 }} animate={{ width: `${total ? (seen / total) * 100 : 0}%` }} transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }} /></div>

        <div className="sg-actions">
          {next ? (
            <button className="btn btn-white btn-lg" onClick={() => playFilm(next)}>
              <Play size={22} fill="currentColor" /> <span>{started ? 'Continuer' : 'Commencer'} : {next.name}</span>
            </button>
          ) : step?.m === null ? (
            <button className="btn btn-white btn-lg" onClick={() => setFix(step.f)}>
              <Pencil size={20} /> <span>Choisir le film : {filmLabel(step.f)}</span>
            </button>
          ) : step ? (
            <button className="btn btn-white btn-lg" disabled><Play size={22} fill="currentColor" /> <span>Recherche de {filmLabel(step.f)}…</span></button>
          ) : first && seen === total ? (
            <button className="btn btn-white btn-lg" onClick={() => playFilm(first)}><Play size={22} fill="currentColor" /> Revoir depuis le début</button>
          ) : (
            <button className="btn btn-white btn-lg" disabled><Play size={22} fill="currentColor" /> Recherche des films…</button>
          )}
          {saga.chrono && (
            <div className="sg-order" role="tablist">
              <button className={!chrono ? 'is-on' : ''} onClick={() => setChrono(saga.id, false)}>Ordre de sortie</button>
              <button className={chrono ? 'is-on' : ''} onClick={() => setChrono(saga.id, true)}>Ordre chronologique</button>
              <span className="sg-order-pill" style={{ transform: chrono ? 'translateX(100%)' : 'none' }} />
            </div>
          )}
        </div>

        <div className="sg-focus">
          <AnimatePresence mode="wait">
            {focusFilm && (
              <motion.div key={focusFilm.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <div className="sg-focus-head">
                  <strong>{focusFilm.name}</strong>
                  {focusFilm.releaseInfo && <span>{String(focusFilm.releaseInfo).slice(0, 4)}</span>}
                  {focusFilm.imdbRating && <span className="sg-rating"><Star size={13} fill="currentColor" /> {focusFilm.imdbRating}</span>}
                  {focusFilm.runtime && <span>{focusFilm.runtime}</span>}
                  {focusFilm.id === next?.id && <span className="sg-focus-next">À voir ensuite</span>}
                </div>
                {focusFilm.description && <p>{focusFilm.description}</p>}
                {focusKey && <button className="sg-wrong" onClick={() => setFix(focusKey)}>Ce n'est pas le bon film ?</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="sg-rail" ref={rail}>
        <div className="sg-track">
          {films.map((f, i) => {
            const m = filmOf(hits, f);
            const isSeenFilm = !!m && isSeen(profile, m.id);
            const isNext = filmKey(f) === stepKey;
            const e = m ? profile?.progress[m.id] : undefined;
            const pct = e && e.duration && !isSeenFilm ? Math.min(100, (e.position / e.duration) * 100) : 0;
            return (
              <motion.div
                key={filmKey(f)}
                layout
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                className={`sg-film ${isSeenFilm ? 'is-seen' : ''} ${isNext ? 'is-next' : ''} ${m === null ? 'is-missing' : ''}`}
                data-key={filmKey(f)}
                onMouseEnter={() => m && setHover(m.id)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="sg-node">
                  <span className="sg-dot">{isSeenFilm ? <Check size={12} strokeWidth={3} /> : null}</span>
                  <span className={`sg-link ${isSeenFilm ? 'is-lit' : ''}`} />
                </div>
                <span className="sg-num">{String(i + 1).padStart(2, '0')}</span>
                <button
                  className="sg-poster"
                  onClick={() => (m ? openDetail({ type: 'movie', id: m.id, preview: m }) : m === null && setFix(f))}
                  title={m ? m.name : m === null ? `Choisir « ${filmLabel(f)} »` : filmLabel(f)}
                >
                  {m ? <Poster m={m} /> : m === null ? (
                    <div className="sg-poster-blank is-pick"><span>{filmLabel(f)}</span><em><Pencil size={14} /> Choisir le film</em></div>
                  ) : (
                    <div className="sg-poster-blank is-loading"><span>{filmLabel(f)}</span></div>
                  )}
                  {isSeenFilm && <span className="sg-seen"><Check size={14} strokeWidth={3} /> Vu</span>}
                  {pct > 0 && <div className="sg-film-bar"><div style={{ width: `${pct}%` }} /></div>}
                  {m && (
                    <span className="sg-play" onClick={(ev) => { ev.stopPropagation(); playFilm(m); }} title="Lecture"><Play size={20} fill="currentColor" /></span>
                  )}
                </button>
                <div className="sg-film-name">{m?.name || filmLabel(f)}</div>
                <div className="sg-film-year">{f[1]}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
      {!allFound && <div className="sg-hint"><Info size={14} /> Recherche des films dans le catalogue…</div>}
      <AnimatePresence>{fix && <FixFilm key={filmKey(fix)} film={fix} onClose={() => setFix(null)} />}</AnimatePresence>
    </motion.div>
  );
}

function Poster({ m }: { m: MetaPreview }) {
  const [ok, setOk] = useState(true);
  return ok
    ? <img src={posterOf(m)} alt={m.name} loading="lazy" decoding="async" draggable={false} onError={() => setOk(false)} />
    : <div className="sg-poster-blank"><span>{m.name}</span></div>;
}

/** Choisir à la main le bon film (retenu pour toujours) */
function FixFilm({ film, onClose }: { film: [string, number]; onClose: () => void }) {
  const [q, setQ] = useState(filmLabel(film));
  const [list, setList] = useState<MetaPreview[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.select(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setList([]); return; }
    let alive = true;
    setList(null);
    const t = setTimeout(() => searchFilms(term).then((r) => {
      if (!alive) return;
      // Les films de la bonne année d'abord
      const y = (m: MetaPreview) => Math.abs((parseInt(String(m.releaseInfo || ''), 10) || 0) - film[1]);
      setList([...r].sort((a, b) => (y(a) <= 1 ? 0 : 1) - (y(b) <= 1 ? 0 : 1)));
    }), 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <motion.div className="sg-fix-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="sg-fix" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
        <button className="sg-fix-close" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        <span className="sg-kicker">Choisir le film</span>
        <h2>{filmLabel(film)} <small>({film[1]})</small></h2>
        <label className="sg-search sg-fix-search">
          <SearchIcon size={16} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre du film" />
        </label>
        <div className="sg-fix-grid">
          {list === null && Array.from({ length: 6 }, (_, i) => <div key={i} className="sg-fix-item"><div className="sg-poster-blank is-loading" /></div>)}
          {list?.length === 0 && <p className="muted">Aucun film trouvé. Essaie le titre anglais ou le titre original.</p>}
          {list?.map((m) => {
            const yr = parseInt(String(m.releaseInfo || ''), 10);
            return (
              <button key={m.id} className={`sg-fix-item ${yr && Math.abs(yr - film[1]) <= 1 ? 'is-match' : ''}`} onClick={() => { setFilm(film, m); onClose(); }}>
                <div className="sg-fix-poster"><Poster m={m} /></div>
                <strong>{m.name}</strong>
                <span>{yr || '—'}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
