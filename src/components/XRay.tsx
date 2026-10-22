import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Clapperboard, History, Loader2, Sparkles, Users, X } from 'lucide-react';
import type { XPerson, XPersonDetails, XScene } from '../lib/xray';
import { IS_TV } from '../lib/tv';
import { navFocus } from '../lib/spatialNav';

type Op = 'scene' | 'person' | 'recap' | 'trivia';
type Reply = { nonce: number; op: Op; data: any; error?: string };
type Tab = 'scene' | 'cast' | 'recap' | 'trivia';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Face({ p, size = 'md' }: { p: XPerson; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`xr-face xr-face-${size}`}>
      {p.photo && !broken ? <img src={p.photo} alt="" onError={() => setBroken(true)} /> : <span>{initials(p.actor)}</span>}
    </div>
  );
}

function age(born?: string) {
  if (!born) return null;
  const d = new Date(born);
  if (isNaN(+d)) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return { date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), age: a };
}

/**
 * X-Ray à la NOCTA : à la pause, les personnages de la scène en cours apparaissent ; la touche X
 * (ou « Tout voir ») ouvre le panneau complet : scène, distribution, fiches acteurs, rattrapage
 * et anecdotes. Les données viennent de la fenêtre principale (clés, casting, sous-titres).
 */
export function XRay({ time, paused, controls, reply, onPause, onPlay, title, subtitle, autoOnPause, started }: {
  time: number;
  paused: boolean;
  controls: boolean;
  reply?: Reply;
  onPause: () => void;
  onPlay: () => void;
  title: string;
  subtitle?: string;
  autoOnPause: boolean;
  started: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('scene');
  const [cast, setCast] = useState<XPerson[] | null>(null);
  const [scene, setScene] = useState<(XScene & { at: number }) | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [person, setPerson] = useState<XPerson | null>(null);
  const [details, setDetails] = useState<Record<string, XPersonDetails | 'loading' | 'error'>>({});
  const [recap, setRecap] = useState<{ range: 'recent' | 'all'; text?: string; at: number } | null>(null);
  const [trivia, setTrivia] = useState<string[] | 'loading' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Map<number, { op: Op; key?: string }>());
  const nonce = useRef(0);
  const resumeOnClose = useRef(false);
  const timeRef = useRef(time);
  timeRef.current = time;

  const ask = useCallback((op: Op, extra: Record<string, unknown> = {}, key?: string) => {
    const n = ++nonce.current;
    pending.current.set(n, { op, key });
    window.nocta!.player.action('xray', { op, nonce: n, time: timeRef.current, ...extra });
  }, []);

  // Réponses de la fenêtre principale
  useEffect(() => {
    if (!reply) return;
    const p = pending.current.get(reply.nonce);
    if (!p) return;
    if (reply.error) { setError(reply.error); setSceneBusy(false); if (p.op === 'person' && p.key) setDetails((d) => ({ ...d, [p.key!]: 'error' })); return; }
    setError(null);
    if (p.op === 'scene') {
      if (reply.data?.cast) setCast(reply.data.cast);
      if (reply.data?.scene) { setScene({ ...reply.data.scene, at: timeRef.current }); setSceneBusy(false); pending.current.delete(reply.nonce); }
    } else {
      pending.current.delete(reply.nonce);
      if (p.op === 'person' && p.key) setDetails((d) => ({ ...d, [p.key!]: reply.data }));
      if (p.op === 'recap') setRecap((r) => (r ? { ...r, text: reply.data } : r));
      if (p.op === 'trivia') setTrivia(reply.data || []);
    }
  }, [reply]);

  /** Analyse de la scène (réutilisée si on est toujours au même endroit) */
  const loadScene = useCallback(() => {
    if (scene && Math.abs(scene.at - timeRef.current) < 25) return;
    if (sceneBusy) return;
    setSceneBusy(true);
    ask('scene');
  }, [scene, sceneBusy, ask]);

  // À la pause : bandeau « Dans cette scène »
  const [strip, setStrip] = useState(false);
  useEffect(() => {
    if (!paused || !started || !autoOnPause || open) { setStrip(false); return; }
    const t = setTimeout(() => { setStrip(true); loadScene(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, started, autoOnPause, open]);

  const openPanel = useCallback((t: Tab = 'scene', who?: XPerson) => {
    if (!paused) { resumeOnClose.current = true; onPause(); }
    setOpen(true);
    setTab(t);
    setPerson(who || null);
    loadScene();
    if (who) showPerson(who);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, onPause, loadScene]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setPerson(null);
    if (resumeOnClose.current) { resumeOnClose.current = false; onPlay(); }
  }, [onPlay]);

  const showPerson = (p: XPerson) => {
    setPerson(p);
    if (!details[p.id] || details[p.id] === 'error') {
      setDetails((d) => ({ ...d, [p.id]: 'loading' }));
      ask('person', { person: p }, p.id);
    }
  };

  // TV : à l'ouverture (ou en changeant de fiche), la télécommande se place dans le panneau
  useEffect(() => {
    if (!IS_TV || !open) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('.xr-panel .xr-tabs .is-on') || document.querySelector<HTMLElement>('.xr-panel button');
      if (el) navFocus(el);
    }, 250);
    return () => clearTimeout(t);
  }, [open, person]);

  // Touche X : ouvrir / fermer ; Échap ferme le panneau avant le lecteur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); e.stopImmediatePropagation(); open ? closePanel() : openPanel(); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopImmediatePropagation(); person ? setPerson(null) : closePanel(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, person, openPanel, closePanel]);

  const inScene = (scene?.ids || []).map((id) => cast?.find((p) => p.id === id)).filter(Boolean) as XPerson[];
  const stripPeople = inScene.length ? inScene : (cast || []).slice(0, 5);

  return (
    <>
      {/* Bandeau à la pause */}
      <AnimatePresence>
        {strip && !open && controls && (cast || sceneBusy) && (
          <motion.div className="xr-strip" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.25 }}>
            <button className="xr-strip-label" onClick={() => openPanel('scene')}>
              <span className="xr-logo">X-RAY</span>
              <small>{inScene.length ? 'Dans cette scène' : sceneBusy ? 'Analyse de la scène…' : 'Distribution'}</small>
            </button>
            <div className="xr-strip-people">
              {!cast && <div className="xr-strip-loading"><Loader2 size={16} className="spin" /> Analyse de la scène…</div>}
              {stripPeople.slice(0, 5).map((p) => (
                <motion.button key={p.id} className="xr-chip" onClick={() => openPanel('scene', p)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} layout>
                  <Face p={p} size="sm" />
                  <span><strong>{p.actor}</strong><small>{p.character || ' '}</small></span>
                </motion.button>
              ))}
              {sceneBusy && cast && <div className="xr-strip-loading"><Loader2 size={14} className="spin" /></div>}
            </div>
            <button className="xr-strip-all" onClick={() => openPanel('cast')}>Tout voir <kbd>X</kbd></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panneau complet */}
      <AnimatePresence>
        {open && (
          <motion.aside
            className="xr-panel"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            onMouseMove={(e) => e.stopPropagation()}
          >
            <header className="xr-head">
              {person ? (
                <button className="xr-icon" onClick={() => setPerson(null)} title="Retour"><ArrowLeft size={18} /></button>
              ) : <span className="xr-logo xr-logo-lg">X-RAY</span>}
              <div className="xr-head-title">
                <strong>{title}</strong>
                <small>{subtitle ? `${subtitle} · ` : ''}{mmss(time)}</small>
              </div>
              <button className="xr-icon" onClick={closePanel} title="Fermer (X)"><X size={18} /></button>
            </header>

            {!person && (
              <nav className="xr-tabs">
                {([['scene', 'Scène', Clapperboard], ['cast', 'Distribution', Users], ['recap', 'Rattrapage', History], ['trivia', 'Anecdotes', Sparkles]] as const).map(([k, l, Icon]) => (
                  <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => { setTab(k); if (k === 'trivia' && !trivia) { setTrivia('loading'); ask('trivia'); } }}>
                    <Icon size={14} /> {l}
                  </button>
                ))}
              </nav>
            )}

            <div className="xr-body">
              {error && !person && <div className="xr-error">{error}</div>}

              {person ? (
                <PersonView p={person} d={details[person.id]} />
              ) : tab === 'scene' ? (
                <>
                  {scene?.moment && <p className="xr-moment">{scene.moment}</p>}
                  {sceneBusy && <div className="xr-loading"><Loader2 size={18} className="spin" /> Analyse de la scène…</div>}
                  {scene?.noSubs && <p className="xr-muted">Pas de sous-titres pour cette vidéo : impossible de savoir qui est à l'écran. Voici la distribution.</p>}
                  {!sceneBusy && scene && !scene.noSubs && !inScene.length && <p className="xr-muted">Personne de la distribution n'a été repéré dans cette scène.</p>}
                  <div className="xr-grid">
                    {(inScene.length ? inScene : scene?.noSubs ? (cast || []).slice(0, 8) : []).map((p) => (
                      <button key={p.id} className="xr-card" onClick={() => showPerson(p)}>
                        <Face p={p} size="lg" />
                        <strong>{p.actor}</strong>
                        <small>{p.character}</small>
                        {scene?.reasons[p.id] && <em>{scene.reasons[p.id]}</em>}
                      </button>
                    ))}
                  </div>
                  {inScene.length > 0 && <button className="xr-link" onClick={() => setTab('cast')}>Toute la distribution <ChevronRight size={14} /></button>}
                </>
              ) : tab === 'cast' ? (
                <div className="xr-list">
                  {!cast && <div className="xr-loading"><Loader2 size={18} className="spin" /> Chargement de la distribution…</div>}
                  {cast?.map((p) => (
                    <button key={p.id} className={`xr-row ${scene?.ids.includes(p.id) ? 'is-here' : ''}`} onClick={() => showPerson(p)}>
                      <Face p={p} size="sm" />
                      <span><strong>{p.actor}</strong><small>{p.character}{p.guest ? ' · invité' : ''}</small></span>
                      {scene?.ids.includes(p.id) && <i className="xr-here">À l'écran</i>}
                      <ChevronRight size={16} className="xr-chev" />
                    </button>
                  ))}
                </div>
              ) : tab === 'recap' ? (
                <div className="xr-recap">
                  <p className="xr-muted">Décroché un instant ? L'IA relit les dialogues et te raconte, sans rien dévoiler de la suite.</p>
                  <div className="xr-recap-btns">
                    <button className={recap?.range === 'recent' ? 'is-on' : ''} onClick={() => { setRecap({ range: 'recent', at: time }); ask('recap', { range: 'recent' }); }}>Les 5 dernières minutes</button>
                    <button className={recap?.range === 'all' ? 'is-on' : ''} onClick={() => { setRecap({ range: 'all', at: time }); ask('recap', { range: 'all' }); }}>Depuis le début</button>
                  </div>
                  {recap && (recap.text
                    ? <div className="xr-recap-text">{recap.text.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l.replace(/\*\*/g, '')}</p>)}</div>
                    : <div className="xr-loading"><Loader2 size={18} className="spin" /> Lecture des dialogues {recap.range === 'recent' ? 'les dernières minutes' : 'depuis le début'}…</div>)}
                </div>
              ) : (
                <div className="xr-trivia">
                  {trivia === 'loading' && <div className="xr-loading"><Loader2 size={18} className="spin" /> Recherche dans les coulisses…</div>}
                  {Array.isArray(trivia) && !trivia.length && <p className="xr-muted">Pas d'anecdote sûre pour celui-ci.</p>}
                  {Array.isArray(trivia) && trivia.map((f, i) => (
                    <motion.div key={i} className="xr-fact" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                      <Sparkles size={14} /> <p>{f}</p>
                    </motion.div>
                  ))}
                  {Array.isArray(trivia) && trivia.length > 0 && <p className="xr-note">Anecdotes rassemblées par l'IA, elle peut se tromper.</p>}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function PersonView({ p, d }: { p: XPerson; d?: XPersonDetails | 'loading' | 'error' }) {
  const [more, setMore] = useState(false);
  const info = d && typeof d === 'object' ? d : null;
  const born = age(info?.born);
  return (
    <motion.div className="xr-person" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <div className="xr-person-top">
        <Face p={p} size="lg" />
        <div>
          <h3>{p.actor}</h3>
          {p.character && <p className="xr-role">joue <strong>{p.character}</strong></p>}
          {born && <p className="xr-muted">Né(e) le {born.date} ({born.age} ans){info?.place ? ` · ${info.place}` : ''}</p>}
        </div>
      </div>
      {d === 'loading' && <div className="xr-loading"><Loader2 size={18} className="spin" /> Chargement…</div>}
      {d === 'error' && <p className="xr-muted">Impossible de charger la fiche pour le moment.</p>}
      {info?.bio && (
        <div className={`xr-bio ${more ? 'is-open' : ''}`}>
          <p>{info.bio}</p>
          {info.bio.length > 320 && <button onClick={() => setMore(!more)}>{more ? 'Moins' : 'Lire la suite'}</button>}
        </div>
      )}
      {info && info.knownFor.length > 0 && (
        <>
          <h4>Aussi dans</h4>
          <div className="xr-known">
            {info.knownFor.map((k) => (
              <div key={k.title} className="xr-poster">
                {k.poster && <img src={k.poster} alt="" />}
                <strong>{k.title}</strong>
                <small>{[k.year, k.character].filter(Boolean).join(' · ')}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
