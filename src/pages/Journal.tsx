import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Heart, MessageSquareText, NotebookPen, Pencil, Plus, Repeat, Search as SearchIcon, X } from 'lucide-react';
import { create } from 'zustand';
import { Avatar } from '../components/Avatar';
import { LikeButton, StarInput, Stars } from '../components/Stars';
import { getMeta } from '../lib/addons';
import { useProfile, useStore } from '../lib/store';
import { backdropOf, posterOf, year } from '../lib/ui';
import {
  dayOf, journalOf, markFilm, openLog, saveEntry, setFavorites, skipToRate, statsOf,
} from '../lib/journal';
import type { Journal as JournalT, JournalEntry, MetaPreview } from '../lib/types';

type Tab = 'diary' | 'films' | 'reviews' | 'torate';
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
  const counts: Record<Tab, number> = {
    diary: j.entries.length,
    films: Object.keys(j.marks).length,
    reviews: j.entries.filter((e) => e.review?.trim()).length,
    torate: toRate.length,
  };
  const TABS: [Tab, string][] = [['diary', 'Journal'], ['films', 'Films & séries'], ['reviews', 'Critiques'], ['torate', 'À noter']];

  return (
    <div className="page jr-page">
      <JournalHero j={j} />
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
          {tab === 'reviews' && <Reviews j={j} />}
          {tab === 'torate' && <ToRate items={toRate} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- En-tête : profil et statistiques

function JournalHero({ j }: { j: JournalT }) {
  const profile = useProfile();
  const s = useMemo(() => statsOf(j), [j]);
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
          <Stat n={s.titles} label="Titres" />
          <Stat n={s.thisYear} label={`En ${new Date().getFullYear()}`} />
          <Stat n={s.hours} label="Heures de films" />
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
        <span>{year(e.meta).slice(0, 4)}{e.meta.type === 'series' ? ' · Série' : ''}</span>
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
    .filter((m) => filter === 'all' || (filter === 'liked' ? m.liked : filter === 'series' ? m.meta.type === 'series' : m.meta.type !== 'series'))
    .sort((a, b) => {
      if (sort === 'best') return (b.rating || 0) - (a.rating || 0) || b.at - a.at;
      if (sort === 'worst') return (a.rating || 9) - (b.rating || 9) || b.at - a.at;
      if (sort === 'title') return a.meta.name.localeCompare(b.meta.name, 'fr');
      if (sort === 'year') return (parseInt(b.meta.releaseInfo || '0', 10) || 0) - (parseInt(a.meta.releaseInfo || '0', 10) || 0);
      return b.at - a.at;
    });
  if (!Object.keys(j.marks).length) {
    return <Empty icon={<Eye size={40} />} title="Aucun titre noté pour l'instant" text="Les étoiles de chaque fiche (et le ❤) remplissent cette collection." />;
  }
  return (
    <div>
      <div className="jr-toolbar">
        <div className="jr-chips">
          {([['all', 'Tout'], ['movie', 'Films'], ['series', 'Séries'], ['liked', 'Coups de cœur']] as const).map(([id, label]) => (
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
          <button onClick={() => openTitle(e.meta)}><strong>{e.meta.name}</strong> <span>{year(e.meta).slice(0, 4)}</span></button>
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

// ---------------------------------------------------------------- À noter

interface Pending { meta: MetaPreview; at: number }

/** Films vus dans NOCTA (cochés « Vu » ou regardés jusqu'au bout) qui ne sont pas encore notés */
function useToRate(j: JournalT): Pending[] {
  const profile = useProfile();
  const addons = useStore((s) => s.addons);
  const [metas, setMetas] = useState<Record<string, MetaPreview | null>>({});
  const ids = useMemo(() => Object.entries(profile?.watched || {})
    .filter(([id]) => /^tt\d+$/.test(id) && !j.marks[id] && !(j.skipped || []).includes(id))
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

  return ids.filter(([id]) => metas[id] && metas[id]!.type !== 'series').map(([id, at]) => ({ meta: metas[id]!, at }));
}

function ToRate({ items }: { items: Pending[] }) {
  if (!items.length) {
    return <Empty icon={<NotebookPen size={40} />} title="Rien à noter" text="Les films que tu regardes jusqu'au bout (ou que tu marques « Vu ») et pas encore notés apparaissent ici." />;
  }
  return (
    <div>
      <p className="jr-lead">Tu as vu ces films dans NOCTA : une note suffit pour les ajouter à ton journal, à la date où tu les as vus.</p>
      <div className="jr-torate">
        <AnimatePresence>
          {items.map((p) => (
            <motion.div key={p.meta.id} className="jr-torate-card" layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <button className="jr-film-poster" onClick={() => openTitle(p.meta)}><img src={posterOf(p.meta)} alt={p.meta.name} loading="lazy" /></button>
              <strong title={p.meta.name}>{p.meta.name}</strong>
              <span className="jr-torate-date">Vu le {new Date(p.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <StarInput onChange={(v) => v && saveEntry({ meta: p.meta, date: dayOf(p.at), rating: v })} size={20} />
              <div className="jr-torate-tools">
                <LikeButton onChange={() => markFilm(p.meta, { liked: true })} size={16} />
                <button onClick={() => openLog(p.meta, { preset: { date: dayOf(p.at) } })} title="Critique"><MessageSquareText size={16} /></button>
                <button onClick={() => skipToRate(p.meta.id)} title="Ne pas noter"><X size={16} /></button>
              </div>
            </motion.div>
          ))}
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
