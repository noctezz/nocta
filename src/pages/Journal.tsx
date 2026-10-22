import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Heart, MessageSquareText, NotebookPen, Pencil, Plus, Repeat, Search as SearchIcon, Trash2, X } from 'lucide-react';
import { create } from 'zustand';
import { Avatar } from '../components/Avatar';
import { LikeButton, StarInput, Stars } from '../components/Stars';
import { getMeta } from '../lib/addons';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, posterOf, year } from '../lib/ui';
import {
  dayOf, journalOf, markFilm, markPart, openLog, partLabel, removeTitle, saveEntry, seasonKey, setFavorites, skipToRate, statsOf,
} from '../lib/journal';
import { sortedEpisodes } from '../lib/playback';
import type { Journal as JournalT, JournalEntry, Meta, MetaPreview, Profile } from '../lib/types';

type Tab = 'diary' | 'films' | 'series' | 'reviews' | 'torate';
const useJournalView = create<{ tab: Tab; year: string; filter: 'all' | 'movie' | 'series' | 'liked'; sort: 'recent' | 'best' | 'worst' | 'title' | 'year' }>(() => ({
  tab: 'diary', year: 'all', filter: 'all', sort: 'recent',
}));

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const dateOf = (d: string) => new Date(`${d}T12:00`);
const openTitle = (m: MetaPreview) => useStore.getState().openDetail({ type: m.type, id: m.id, preview: m });
const fr = (n: number, digits = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function Journal() {
  const profile = useProfile();
  const j = journalOf(profile);
  const tab = useJournalView((s) => s.tab);
  const toRate = useToRate(j);
  const seriesIds = useSeriesIds(j, profile);
  const counts: Record<Tab, number> = {
    diary: j.entries.length,
    films: Object.values(j.marks).filter((m) => m.meta.type !== 'series').length,
    series: seriesIds.length,
    reviews: j.entries.filter((e) => e.review?.trim()).length,
    torate: toRate.length,
  };
  const TABS: [Tab, string][] = [['diary', 'Journal'], ['films', 'Films'], ['series', 'Séries'], ['reviews', 'Critiques'], ['torate', 'À noter']];

  return (
    <div className="page jr-page">
      <JournalHero j={j} seriesCount={seriesIds.length} />
      <Favorites j={j} />
      <nav className="jr-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'is-on' : ''} onClick={() => useJournalView.setState({ tab: id })}>
            {label} {counts[id] > 0 && <em>{counts[id]}</em>}
            {tab === id && <motion.span layoutId="jr-tab" className="jr-tab-line" />}
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait">
        <motion.div key={tab} className="jr-body" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'diary' && <Diary j={j} />}
          {tab === 'films' && <Films j={j} />}
          {tab === 'series' && <SeriesShelf j={j} ids={seriesIds} />}
          {tab === 'reviews' && <Reviews j={j} />}
          {tab === 'torate' && <ToRate items={toRate} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- En-tête : profil et statistiques

function JournalHero({ j, seriesCount }: { j: JournalT; seriesCount: number }) {
  const profile = useProfile();
  const s = useMemo(() => statsOf(j), [j]);
  const episodes = Object.keys(profile?.watched || {}).filter((id) => EP.test(id)).length;
  const max = Math.max(1, ...s.hist);
  const bg = (j.favorites || []).map((id) => j.marks[id]?.meta).find(Boolean) || j.entries[0]?.meta;
  return (
    <header className="jr-hero">
      {bg && <div className="jr-hero-bg" style={{ backgroundImage: `url(${backdropOf(bg)})` }} />}
      <div className="jr-hero-shade" />
      <div className="jr-hero-inner">
        <div className="jr-who">
          {profile && <Avatar avatar={profile.avatar} size={84} className="jr-avatar" />}
          <div>
            <span className="jr-kicker">Journal</span>
            <h1>{profile?.name || 'Mon journal'}</h1>
            <p>{s.titles ? `${s.titles} titre${s.titles > 1 ? 's' : ''} au compteur, et ce n'est qu'un début.` : 'Note, aime et raconte tout ce que tu regardes.'}</p>
          </div>
        </div>
        <div className="jr-stats">
          <Stat n={s.films} label="Films" />
          <Stat n={seriesCount} label="Séries" />
          <Stat n={episodes} label="Épisodes vus" />
          <Stat n={s.thisYear} label={`En ${new Date().getFullYear()}`} />
          <Stat n={s.reviews} label="Critiques" />
          <Stat n={s.liked} label="Coups de cœur" />
        </div>
        <div className="jr-hist" title="Répartition de tes notes">
          <div className="jr-hist-head">
            <span>Tes notes</span>
            {s.average > 0 && <strong>{fr(s.average, 1)} <small>de moyenne</small></strong>}
          </div>
          <div className="jr-hist-bars">
            {s.hist.map((n, i) => (
              <div key={i} className="jr-hist-bar" title={`${fr((i + 1) / 2, (i + 1) % 2 ? 1 : 0)} étoile${i ? 's' : ''} : ${n} titre${n > 1 ? 's' : ''}`}>
                <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(n ? 8 : 3, (n / max) * 100)}%` }} transition={{ delay: 0.1 + i * 0.03, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} className={n ? '' : 'is-zero'} />
              </div>
            ))}
          </div>
          <div className="jr-hist-axis"><span>½</span><span>★★★★★</span></div>
        </div>
      </div>
    </header>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="jr-stat">
      <strong>{fr(n)}</strong>
      <span>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- 4 favoris

function Favorites({ j }: { j: JournalT }) {
  const fav = j.favorites || [];
  const [pick, setPick] = useState<number | null>(null);
  const slots = [0, 1, 2, 3].map((i) => (fav[i] ? j.marks[fav[i]]?.meta || j.entries.find((e) => e.meta.id === fav[i])?.meta : undefined));
  return (
    <section className="jr-favs">
      <h2>Mes 4 favoris</h2>
      <div className="jr-favs-row">
        {slots.map((m, i) => (
          <motion.div key={i} className={`jr-fav ${m ? '' : 'is-empty'}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}>
            {m ? (
              <>
                <button className="jr-fav-poster" onClick={() => openTitle(m)} title={m.name}><img src={posterOf(m)} alt={m.name} /></button>
                <div className="jr-fav-tools">
                  <button onClick={() => setPick(i)} title="Changer"><Pencil size={14} /></button>
                  <button onClick={() => setFavorites(fav.filter((_, k) => k !== i))} title="Retirer"><X size={14} /></button>
                </div>
              </>
            ) : (
              <button className="jr-fav-add" onClick={() => setPick(i)}><Plus size={26} /><span>Choisir</span></button>
            )}
          </motion.div>
        ))}
      </div>
      <AnimatePresence>
        {pick !== null && <FavPicker j={j} onPick={(id) => {
          // Le titre prend la place choisie (et quitte son ancienne place s'il y était déjà)
          const next = fav.filter((x) => x !== id);
          if (pick < next.length) next[pick] = id; else next.push(id);
          setFavorites(next);
          setPick(null);
        }} onClose={() => setPick(null)} />}
      </AnimatePresence>
    </section>
  );
}

function FavPicker({ j, onPick, onClose }: { j: JournalT; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const all = Object.values(j.marks).sort((a, b) => (b.liked ? 1 : 0) - (a.liked ? 1 : 0) || (b.rating || 0) - (a.rating || 0));
  const list = all.filter((m) => !q.trim() || m.meta.name.toLowerCase().includes(q.trim().toLowerCase()));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div className="log-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="jr-picker" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
        <button className="log-close" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        <span className="log-kicker">Mes 4 favoris</span>
        <h2>Choisis un titre</h2>
        <label className="jr-search"><SearchIcon size={16} /><input autoFocus placeholder="Chercher dans ton journal…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {all.length === 0 && <p className="muted">Note d'abord quelques films : ils apparaîtront ici.</p>}
        <div className="jr-picker-grid">
          {list.map((m) => (
            <button key={m.meta.id} onClick={() => onPick(m.meta.id)} title={m.meta.name}>
              <img src={posterOf(m.meta)} alt="" loading="lazy" />
              <span>{m.meta.name}</span>
              <Stars value={m.rating} size={11} />
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- Journal (séances)

function Diary({ j }: { j: JournalT }) {
  const yearSel = useJournalView((s) => s.year);
  const years = [...new Set(j.entries.map((e) => e.date.slice(0, 4)))].sort().reverse();
  const shown = j.entries.filter((e) => yearSel === 'all' || e.date.startsWith(yearSel))
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const months = useMemo(() => {
    const out: { key: string; items: JournalEntry[] }[] = [];
    for (const e of shown) {
      const k = e.date.slice(0, 7);
      if (out[out.length - 1]?.key !== k) out.push({ key: k, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [shown]);

  if (!j.entries.length) {
    return (
      <Empty
        icon={<NotebookPen size={40} />}
        title="Ton journal est vide"
        text="Ouvre la fiche d'un film et clique sur « Ajouter au journal », ou note un film à la fin de la séance : chaque séance s'affichera ici, mois par mois."
      />
    );
  }
  return (
    <div className="jr-diary">
      {years.length > 1 && (
        <div className="jr-chips">
          {['all', ...years].map((y) => (
            <button key={y} className={yearSel === y ? 'is-on' : ''} onClick={() => useJournalView.setState({ year: y })}>{y === 'all' ? 'Toutes les années' : y}</button>
          ))}
        </div>
      )}
      {months.map((m) => {
        const d = dateOf(`${m.key}-01`);
        return (
          <section key={m.key} className="jr-month">
            <h3><span>{MONTHS[d.getMonth()]}</span> {d.getFullYear()}<em>{m.items.length} séance{m.items.length > 1 ? 's' : ''}</em></h3>
            <div className="jr-rows">
              {m.items.map((e, i) => <DiaryRow key={e.id} e={e} i={i} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DiaryRow({ e, i }: { e: JournalEntry; i: number }) {
  const d = dateOf(e.date);
  return (
    <motion.div className="jr-row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
      <div className="jr-row-day"><strong>{d.getDate()}</strong><span>{DAYS[d.getDay()]}</span></div>
      <button className="jr-row-poster" onClick={() => openTitle(e.meta)}><img src={posterOf(e.meta)} alt="" loading="lazy" /></button>
      <button className="jr-row-title" onClick={() => openTitle(e.meta)}>
        <strong>{e.meta.name}</strong>
        {e.season != null
          ? <em className="jr-part">{partLabel(e, true)}</em>
          : <span>{year(e.meta).slice(0, 4)}{e.meta.type === 'series' ? ' · Série' : ''}</span>}
        {e.episodeTitle && <span className="jr-ep-title">{e.episodeTitle}</span>}
      </button>
      <div className="jr-row-marks">
        <Stars value={e.rating} size={15} />
        {e.liked && <Heart size={15} className="jr-heart" fill="currentColor" />}
        {e.rewatch && <Repeat size={15} className="jr-icon" aria-label="Revu" />}
        {e.review && <MessageSquareText size={15} className="jr-icon" aria-label="Critique" />}
      </div>
      <button className="jr-row-edit" onClick={() => openLog(e.meta, { entry: e })} title="Modifier"><Pencil size={15} /></button>
      <div className="jr-row-glow" style={{ backgroundImage: `url(${backdropOf(e.meta)})` }} />
    </motion.div>
  );
}

// ---------------------------------------------------------------- Films & séries notés

function Films({ j }: { j: JournalT }) {
  const { filter, sort } = useJournalView();
  const list = Object.values(j.marks)
    .filter((m) => m.meta.type !== 'series' && (filter !== 'liked' || m.liked))
    .sort((a, b) => {
      if (sort === 'best') return (b.rating || 0) - (a.rating || 0) || b.at - a.at;
      if (sort === 'worst') return (a.rating || 9) - (b.rating || 9) || b.at - a.at;
      if (sort === 'title') return a.meta.name.localeCompare(b.meta.name, 'fr');
      if (sort === 'year') return (parseInt(b.meta.releaseInfo || '0', 10) || 0) - (parseInt(a.meta.releaseInfo || '0', 10) || 0);
      return b.at - a.at;
    });
  if (!Object.values(j.marks).some((m) => m.meta.type !== 'series')) {
    return <Empty icon={<Eye size={40} />} title="Aucun film noté pour l'instant" text="Les étoiles de chaque fiche (et le ❤) remplissent cette collection." />;
  }
  return (
    <div>
      <div className="jr-toolbar">
        <div className="jr-chips">
          {([['all', 'Tous les films'], ['liked', 'Coups de cœur']] as const).map(([id, label]) => (
            <button key={id} className={filter === id ? 'is-on' : ''} onClick={() => useJournalView.setState({ filter: id })}>
              {id === 'liked' && <Heart size={13} fill="currentColor" />} {label}
            </button>
          ))}
        </div>
        <select className="select" value={sort} onChange={(e) => useJournalView.setState({ sort: e.target.value as typeof sort })}>
          <option value="recent">Notés récemment</option>
          <option value="best">Les mieux notés</option>
          <option value="worst">Les moins bien notés</option>
          <option value="title">Titre</option>
          <option value="year">Année de sortie</option>
        </select>
      </div>
      <div className="jr-grid">
        {list.map((m, i) => (
          <motion.div key={m.meta.id} className="jr-film" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.015, 0.4) }}>
            <button className="jr-film-poster" onClick={() => openTitle(m.meta)} title={m.meta.name}>
              <img src={posterOf(m.meta)} alt={m.meta.name} loading="lazy" />
            </button>
            <button className="jr-film-remove" onClick={() => removeTitle(m.meta)} title="Retirer du journal"><Trash2 size={14} /></button>
            <div className="jr-film-marks">
              <Stars value={m.rating} size={12} />
              {m.liked && <Heart size={12} className="jr-heart" fill="currentColor" />}
            </div>
          </motion.div>
        ))}
      </div>
      {list.length === 0 && <p className="muted jr-none">Rien ici avec ce filtre.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Critiques

function Reviews({ j }: { j: JournalT }) {
  const list = j.entries.filter((e) => e.review?.trim()).sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) {
    return <Empty icon={<MessageSquareText size={40} />} title="Aucune critique" text="Quand tu ajoutes une séance au journal, écris quelques mots : tes critiques se rassemblent ici." />;
  }
  return <div className="jr-reviews">{list.map((e, i) => <ReviewCard key={e.id} e={e} i={i} />)}</div>;
}

function ReviewCard({ e, i }: { e: JournalEntry; i: number }) {
  const [reveal, setReveal] = useState(false);
  const hidden = e.spoilers && !reveal;
  return (
    <motion.article className="jr-review" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.05, 0.4) }}>
      <div className="jr-review-bg" style={{ backgroundImage: `url(${backdropOf(e.meta)})` }} />
      <button className="jr-review-poster" onClick={() => openTitle(e.meta)}><img src={posterOf(e.meta)} alt="" loading="lazy" /></button>
      <div className="jr-review-main">
        <div className="jr-review-head">
          <button onClick={() => openTitle(e.meta)}><strong>{e.meta.name}</strong> <span>{e.season != null ? partLabel(e) : year(e.meta).slice(0, 4)}</span></button>
          <Stars value={e.rating} size={14} />
          {e.liked && <Heart size={14} className="jr-heart" fill="currentColor" />}
        </div>
        <span className="jr-review-date">Vu le {dateOf(e.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{e.rewatch ? ' · revu' : ''}</span>
        <p className={hidden ? 'is-hidden' : ''}>{e.review}</p>
        {e.spoilers && (
          <button className="jr-spoil" onClick={() => setReveal(!reveal)}>
            {hidden ? <><Eye size={14} /> Contient des spoilers : afficher</> : <><EyeOff size={14} /> Masquer</>}
          </button>
        )}
      </div>
      <button className="jr-row-edit" onClick={() => openLog(e.meta, { entry: e })} title="Modifier"><Pencil size={15} /></button>
    </motion.article>
  );
}

// ---------------------------------------------------------------- Séries

const EP = /^(tt\d+):(\d+):(\d+)$/;

/** Épisodes vus, regroupés par série puis par saison (avec la date du dernier vu) */
function watchedBySeries(p: Profile | null) {
  const out: Record<string, { count: number; last: number; seasons: Record<number, { ids: Set<string>; last: number }> }> = {};
  for (const [id, at] of Object.entries(p?.watched || {})) {
    const m = EP.exec(id);
    if (!m) continue;
    const s = +m[2];
    const x = (out[m[1]] ||= { count: 0, last: 0, seasons: {} });
    x.count++;
    x.last = Math.max(x.last, at);
    const ss = (x.seasons[s] ||= { ids: new Set(), last: 0 });
    ss.ids.add(id);
    ss.last = Math.max(ss.last, at);
  }
  return out;
}

/** Séries présentes dans le journal (notées, saisons ou épisodes notés, séances) ou commencées dans NOCTA */
function useSeriesIds(j: JournalT, p: Profile | null) {
  return useMemo(() => {
    const ids = new Set<string>();
    for (const m of Object.values(j.marks)) if (m.meta.type === 'series') ids.add(m.meta.id);
    for (const k of [...Object.keys(j.seasons || {}), ...Object.keys(j.episodes || {})]) ids.add(k.split(':')[0]);
    for (const e of j.entries) if (e.meta.type === 'series') ids.add(e.meta.id);
    for (const id of Object.keys(watchedBySeries(p))) ids.add(id);
    for (const id of j.removed || []) if (!inJournalLite(j, id)) ids.delete(id);
    return [...ids];
  }, [j, p?.watched]);
}

/** Le titre a-t-il encore quelque chose dans le journal (noté de nouveau après avoir été retiré) ? */
const inJournalLite = (j: JournalT, id: string) => !!j.marks[id] || j.entries.some((e) => e.meta.id === id);

const seriesCache = new Map<string, Meta | null>();

/** Fiches complètes des séries (saisons et épisodes), chargées une fois */
function useSeriesMetas(ids: string[]) {
  const addons = useStore((s) => s.addons);
  const [, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const id of ids.slice(0, 40)) {
        if (seriesCache.has(id)) continue;
        seriesCache.set(id, null);
        const m = await getMeta(addons, 'series', id).catch(() => null);
        seriesCache.set(id, m);
        if (alive) bump((x) => x + 1);
      }
    })();
    return () => { alive = false; };
  }, [ids.join(','), addons]);
  return (id: string) => seriesCache.get(id) || null;
}

/** Saisons d'une série et leurs épisodes (hors bonus) */
function seasonsOf(m: Meta | null) {
  const out: Record<number, string[]> = {};
  if (!m) return out;
  for (const v of sortedEpisodes(m)) if (v.season && v.season > 0) (out[v.season] ||= []).push(v.id);
  return out;
}

function SeriesShelf({ j, ids }: { j: JournalT; ids: string[] }) {
  const profile = useProfile();
  const full = useSeriesMetas(ids);
  const watched = useMemo(() => watchedBySeries(profile), [profile?.watched]);
  const metaOf = (id: string): MetaPreview | null => j.marks[id]?.meta || j.entries.find((e) => e.meta.id === id)?.meta || profile?.progress[id]?.meta || full(id) || null;
  const activity = (id: string) => Math.max(j.marks[id]?.at || 0, watched[id]?.last || 0, ...j.entries.filter((e) => e.meta.id === id).map((e) => e.at));
  const list = ids.filter((id) => metaOf(id)).sort((a, b) => activity(b) - activity(a));
  if (!list.length) {
    return <Empty icon={<Eye size={40} />} title="Aucune série pour l'instant" text="Les séries que tu regardes dans NOCTA et celles que tu notes (la série, une saison ou un épisode) se rangent ici, saison par saison." />;
  }
  return (
    <div className="jr-series">
      {list.map((id, i) => <SeriesRow key={id} j={j} meta={metaOf(id)!} full={full(id)} w={watched[id]} i={i} />)}
    </div>
  );
}

function SeriesRow({ j, meta, full, w, i }: { j: JournalT; meta: MetaPreview; full: Meta | null; w?: ReturnType<typeof watchedBySeries>[string]; i: number }) {
  const mark = j.marks[meta.id];
  const seasons = seasonsOf(full);
  // Saisons connues : celles de la fiche, sinon celles notées ou commencées
  const nums = Object.keys(seasons).length
    ? Object.keys(seasons).map(Number)
    : [...new Set([...Object.keys(j.seasons || {}).filter((k) => k.startsWith(`${meta.id}:`)).map((k) => +k.split(':')[1]), ...Object.keys(w?.seasons || {}).map(Number)])].filter((n) => n > 0).sort((a, b) => a - b);
  const total = Object.values(seasons).reduce((n, x) => n + x.length, 0);
  const seen = w?.count || 0;
  const done = nums.filter((s) => seasons[s]?.length && seasons[s].every((id) => w?.seasons[s]?.ids.has(id))).length;
  const epRated = Object.keys(j.episodes || {}).filter((k) => k.startsWith(`${meta.id}:`)).length;
  return (
    <motion.div className="jr-srow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}>
      <div className="jr-srow-glow" style={{ backgroundImage: `url(${backdropOf(meta)})` }} />
      <button className="jr-srow-poster" onClick={() => openTitle(meta)}><img src={posterOf(meta)} alt="" loading="lazy" /></button>
      <div className="jr-srow-main">
        <div className="jr-srow-head">
          <button className="jr-srow-title" onClick={() => openTitle(meta)}><strong>{meta.name}</strong> <span>{year(meta).slice(0, 4)}</span></button>
          <div className="jr-srow-rate">
            <StarInput value={mark?.rating} onChange={(v) => markFilm(meta, { rating: v })} size={20} />
            <LikeButton liked={mark?.liked} onChange={(v) => markFilm(meta, { liked: v })} size={18} />
          </div>
        </div>
        <div className="jr-srow-stats">
          {seen > 0 && <span>{seen} épisode{seen > 1 ? 's' : ''} vu{seen > 1 ? 's' : ''}{total ? ` sur ${total}` : ''}</span>}
          {done > 0 && <span>{done === nums.length && nums.length ? 'Série terminée' : `${done} saison${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''}`}</span>}
          {epRated > 0 && <span>{epRated} épisode{epRated > 1 ? 's' : ''} noté{epRated > 1 ? 's' : ''}</span>}
        </div>
        {total > 0 && <div className="jr-srow-bar"><div style={{ width: `${Math.min(100, (seen / total) * 100)}%` }} /></div>}
        <div className="jr-seasons">
          {nums.map((s) => {
            const sm = j.seasons?.[seasonKey(meta.id, s)];
            const all = seasons[s]?.length && seasons[s].every((id) => w?.seasons[s]?.ids.has(id));
            const started = !!w?.seasons[s];
            return (
              <button
                key={s}
                className={`jr-season ${sm?.rating ? 'is-rated' : ''} ${all ? 'is-done' : started ? 'is-started' : ''}`}
                onClick={() => openLog(meta, { preset: { season: s } })}
                title={all ? `Saison ${s} terminée` : started ? `Saison ${s} commencée` : `Saison ${s}`}
              >
                <span className="jr-season-n">S{s}</span>
                {sm?.rating ? <Stars value={sm.rating} size={11} /> : <span className="jr-season-none">{all ? 'À noter' : started ? 'En cours' : '—'}</span>}
                {sm?.liked && <Heart size={11} className="jr-heart" fill="currentColor" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="jr-srow-tools">
        <button className="jr-row-edit" onClick={() => openLog(meta)} title="Ajouter au journal"><NotebookPen size={15} /></button>
        <button className="jr-row-edit" onClick={() => removeTitle(meta)} title="Retirer du journal"><Trash2 size={15} /></button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- À noter

/** Un film vu, ou une saison terminée, pas encore notés */
interface Pending { meta: MetaPreview; at: number; season?: number }
const pendingKey = (p: Pending) => (p.season != null ? seasonKey(p.meta.id, p.season) : p.meta.id);

/** Films vus dans NOCTA (cochés « Vu » ou regardés jusqu'au bout) et saisons terminées, pas encore notés */
function useToRate(j: JournalT): Pending[] {
  const profile = useProfile();
  const addons = useStore((s) => s.addons);
  const [metas, setMetas] = useState<Record<string, MetaPreview | null>>({});
  const skipped = j.skipped || [];
  const ids = useMemo(() => Object.entries(profile?.watched || {})
    .filter(([id]) => /^tt\d+$/.test(id) && !j.marks[id] && !skipped.includes(id) && !(j.removed || []).includes(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60), [profile?.watched, j]);

  useEffect(() => {
    let alive = true;
    const known = (id: string) => profile?.myList.find((m) => m.id === id) || profile?.progress[id]?.meta;
    (async () => {
      for (const [id] of ids) {
        if (id in metas) continue;
        const m = known(id) || (await getMeta(addons, 'movie', id).catch(() => null));
        if (!alive) return;
        setMetas((x) => ({ ...x, [id]: m ? { ...m, type: m.type || 'movie' } : null }));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  // Saisons entièrement vues et pas encore notées
  const watched = useMemo(() => watchedBySeries(profile), [profile?.watched]);
  const sids = useMemo(() => Object.keys(watched), [watched]);
  const full = useSeriesMetas(sids);
  const seasonsDone: Pending[] = [];
  for (const id of sids) {
    if (j.removed?.includes(id)) continue;
    const m = full(id);
    if (!m) continue;
    for (const [sn, eps] of Object.entries(seasonsOf(m))) {
      const s = +sn;
      const key = seasonKey(id, s);
      const w = watched[id].seasons[s];
      if (!w || !eps.every((e) => w.ids.has(e)) || j.seasons?.[key]?.rating || skipped.includes(key)) continue;
      if (j.entries.some((e) => e.meta.id === id && e.season === s && e.episode == null)) continue;
      seasonsDone.push({ meta: { ...m, type: 'series' }, season: s, at: w.last });
    }
  }

  const films = ids.filter(([id]) => metas[id] && metas[id]!.type !== 'series').map(([id, at]) => ({ meta: metas[id]!, at }));
  return [...films, ...seasonsDone].sort((a, b) => b.at - a.at);
}

function ToRate({ items }: { items: Pending[] }) {
  if (!items.length) {
    return <Empty icon={<NotebookPen size={40} />} title="Rien à noter" text="Les films que tu regardes jusqu'au bout (ou que tu marques « Vu ») et les saisons que tu termines apparaissent ici tant qu'ils ne sont pas notés." />;
  }
  return (
    <div>
      <p className="jr-lead">Tu as vu tout ça dans NOCTA : une note suffit pour l'ajouter à ton journal, à la date où tu l'as vu.</p>
      <div className="jr-torate">
        <AnimatePresence>
          {items.map((p) => {
            const part = p.season != null ? { season: p.season } : {};
            return (
              <motion.div key={pendingKey(p)} className="jr-torate-card" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <button className="jr-film-poster" onClick={() => openTitle(p.meta)}>
                  <img src={posterOf(p.meta)} alt={p.meta.name} loading="lazy" />
                  {p.season != null && <span className="jr-torate-badge">Saison {p.season}</span>}
                </button>
                <strong title={p.meta.name}>{p.meta.name}</strong>
                <span className="jr-torate-date">{p.season != null ? 'Terminée le' : 'Vu le'} {new Date(p.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <StarInput onChange={(v) => v && saveEntry({ meta: p.meta, date: dayOf(p.at), rating: v, ...part })} size={20} />
                <div className="jr-torate-tools">
                  <LikeButton onChange={() => (p.season != null ? markPart(p.meta, p.season, null, { liked: true }) : markFilm(p.meta, { liked: true }))} size={16} />
                  <button onClick={() => openLog(p.meta, { preset: { date: dayOf(p.at), ...part } })} title="Critique"><MessageSquareText size={16} /></button>
                  <button onClick={() => skipToRate(pendingKey(p))} title="Ne pas noter"><X size={16} /></button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="jr-empty">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
