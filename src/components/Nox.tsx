import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Mic, RotateCcw, Square, X } from 'lucide-react';
import { useNox } from '../lib/nox';
import { useStore } from '../lib/store';
import { listen, type Listening } from '../lib/voice';

/**
 * Nox, la chouette de NOCTA (dessin original en SVG) : flotte, cligne des yeux,
 * suit la souris du regard et réfléchit quand elle travaille.
 */
export function NoxOwl({ size = 72, thinking = false, look = { x: 0, y: 0 } }: { size?: number; thinking?: boolean; look?: { x: number; y: number } }) {
  const px = thinking ? 0 : look.x * 3.2;
  const py = thinking ? -3.5 : look.y * 2.6;
  return (
    <svg className={`nox-owl ${thinking ? 'is-thinking' : ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="noxBody" cx="45%" cy="35%" r="75%">
          <stop offset="0" stopColor="#5b2b86" />
          <stop offset="0.6" stopColor="#2c1446" />
          <stop offset="1" stopColor="#140820" />
        </radialGradient>
        <radialGradient id="noxBelly" cx="50%" cy="30%" r="70%">
          <stop offset="0" stopColor="#ff6b86" />
          <stop offset="1" stopColor="#b3082f" />
        </radialGradient>
        <radialGradient id="noxEye" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e2f0" />
        </radialGradient>
      </defs>
      {/* aigrettes */}
      <path d="M24 30 L18 8 L38 22 Z" fill="#2c1446" />
      <path d="M76 30 L82 8 L62 22 Z" fill="#2c1446" />
      {/* corps */}
      <ellipse cx="50" cy="56" rx="34" ry="36" fill="url(#noxBody)" />
      {/* ventre doux et plumes */}
      <ellipse cx="50" cy="72" rx="19" ry="17" fill="url(#noxBelly)" opacity="0.35" />
      <path d="M41 68 q3 3 6 0 M53 68 q3 3 6 0 M47 75 q3 3 6 0 M39 77 q3 3 6 0 M55 77 q3 3 6 0" stroke="#ffc2d0" strokeWidth="1.4" fill="none" opacity="0.55" strokeLinecap="round" />
      {/* joues */}
      <ellipse cx="25" cy="55" rx="5" ry="3" fill="#ff5c7c" opacity="0.45" />
      <ellipse cx="75" cy="55" rx="5" ry="3" fill="#ff5c7c" opacity="0.45" />
      {/* ailes */}
      <path className="nox-wing-l" d="M17 52 Q8 66 18 80 Q24 70 22 56 Z" fill="#1d0c31" />
      <path className="nox-wing-r" d="M83 52 Q92 66 82 80 Q76 70 78 56 Z" fill="#1d0c31" />
      {/* yeux */}
      <g className="nox-eyes">
        <circle cx="36" cy="44" r="13" fill="#140820" />
        <circle cx="64" cy="44" r="13" fill="#140820" />
        <circle cx="36" cy="44" r="10.5" fill="url(#noxEye)" />
        <circle cx="64" cy="44" r="10.5" fill="url(#noxEye)" />
        <g style={{ transform: `translate(${px}px, ${py}px)`, transition: 'transform 0.25s ease-out' }}>
          <circle cx="36" cy="45" r="5.6" fill="#16091f" />
          <circle cx="64" cy="45" r="5.6" fill="#16091f" />
          <circle cx="37.8" cy="42.8" r="1.9" fill="#fff" />
          <circle cx="65.8" cy="42.8" r="1.9" fill="#fff" />
        </g>
        {/* paupières (clignement) */}
        <rect className="nox-lid" x="24" y="30" width="24" height="0" fill="#2c1446" />
        <rect className="nox-lid" x="52" y="30" width="24" height="0" fill="#2c1446" />
      </g>
      {/* bec */}
      <path d="M46 55 L54 55 L50 62 Z" fill="#ffb347" />
      {/* petite lune sur la tête */}
      <path d="M50 12 a7 7 0 1 0 6 10 a5.5 5.5 0 1 1 -6 -10 Z" fill="#ff3b5c" className="nox-moon" />
    </svg>
  );
}

/** Mise en forme légère des réponses : **gras**, listes et retours à la ligne */
function rich(text: string): ReactNode {
  return text.split('\n').map((line, i) => {
    const bullet = /^\s*[-•*]\s+/.test(line);
    const parts = line.replace(/^\s*[-•*]\s+/, '').split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>);
    return <div key={i} className={bullet ? 'nox-li' : line.trim() ? '' : 'nox-gap'}>{parts}</div>;
  });
}

function suggestions(): string[] {
  const st = useStore.getState();
  if (st.detail) {
    return st.detail.type === 'series'
      ? ['Il y a qui au casting ?', 'Le prochain épisode est en vraie VF ?', 'Ça vaut le coup ?']
      : ['Il y a qui au casting ?', 'Il est dispo en vraie VF ?', 'Ça dure combien de temps ?'];
  }
  return ['Recommande-moi un film pour ce soir', 'Je regarde quoi en ce moment ?', 'Une bonne série en VF ?'];
}

/** Bouton chouette en bas à gauche + fenêtre de discussion */
export function Nox() {
  const { open, busy, items, setOpen, ask, reset } = useNox();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setPage = useStore((s) => s.setPage);
  useStore((s) => s.detail);
  const [text, setText] = useState('');
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hello, setHello] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Micro : écoute → transcription → question
  const [voice, setVoice] = useState<'idle' | 'listening' | 'speaking' | 'transcribing'>('idle');
  const [level, setLevel] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const rec = useRef<Listening | null>(null);

  // Le regard suit la souris
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      setLook({ x: dx / d, y: dy / d });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Petite bulle de présentation la première fois
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem('nox-hello') === '1'; } catch {}
    if (seen) return;
    const t = setTimeout(() => setHello(true), 6000);
    const t2 = setTimeout(() => setHello(false), 16000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [items, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (rec.current) rec.current.cancel();
      else setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Fermer le panneau coupe le micro
  useEffect(() => { if (!open) rec.current?.cancel(); }, [open]);
  useEffect(() => () => rec.current?.cancel(), []);

  if (settings.noxVisible === false) return null;
  const hasKey = !!(settings.noxKey || '').trim();

  const send = (t = text) => {
    if (!t.trim() || busy) return;
    setText('');
    ask(t);
  };

  const talk = async () => {
    if (rec.current) { rec.current.stop(); return; }
    if (busy || voice === 'transcribing') return;
    setVoiceError('');
    let r: Listening;
    try {
      r = await listen(setLevel, () => setVoice('speaking'));
    } catch (e) {
      const name = (e as DOMException)?.name;
      setVoiceError(name === 'NotAllowedError' ? 'Micro refusé : autorise-le dans les réglages de Windows (Confidentialité → Microphone).' : name === 'NotFoundError' ? 'Aucun micro détecté.' : 'Impossible d\'ouvrir le micro.');
      return;
    }
    rec.current = r;
    setVoice('listening');
    const audio = await r.done;
    rec.current = null;
    if (!audio) { setVoice('idle'); return; }
    setVoice('transcribing');
    const res = await window.nocta!.assistant.transcribe({ apiKey: (settings.noxKey || '').trim(), ...audio });
    setVoice('idle');
    if (!res.ok) { setVoiceError(res.error || 'Transcription impossible'); return; }
    const said = (res.text || '').trim();
    if (said.length < 2) { setVoiceError('Je n\'ai pas compris, tu peux répéter ?'); return; }
    ask(said);
  };
  const recording = voice === 'listening' || voice === 'speaking';

  return (
    <>
      <AnimatePresence>
        {hello && !open && (
          <motion.div className="nox-hello" data-nav-skip initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}>
            Coucou, moi c'est <b>Nox</b> 🦉 Une question sur un film ? Clique sur moi !
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={btnRef}
        className={`nox-button ${open ? 'is-open' : ''}`}
        onClick={() => { setOpen(!open); setHello(false); try { localStorage.setItem('nox-hello', '1'); } catch {} }}
        aria-label="Nox, ton assistant"
        title="Nox, ton assistant"
        data-nav-skip
      >
        <NoxOwl size={74} thinking={busy} look={look} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="nox-panel"
            data-nav-scope
            initial={{ opacity: 0, y: 24, scale: 0.96, transformOrigin: 'bottom left' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="nox-head">
              <NoxOwl size={42} thinking={busy} />
              <div>
                <strong>Nox</strong>
                <small>{busy ? 'réfléchit…' : 'ton assistant ciné'}</small>
              </div>
              {items.length > 0 && <button className="nox-icon" onClick={reset} title="Nouvelle discussion"><RotateCcw size={16} /></button>}
              <button className="nox-icon" data-nav-back onClick={() => setOpen(false)} title="Fermer"><X size={18} /></button>
            </div>

            {!hasKey ? (
              <NoxSetup onDone={(k) => update({ noxKey: k })} onSettings={() => { setOpen(false); setPage('settings'); }} />
            ) : (
              <>
                <div className="nox-list" ref={listRef}>
                  {items.length === 0 && (
                    <div className="nox-empty">
                      <p>Salut ! Je connais le catalogue par cœur. Demande-moi un casting, une recommandation, ou si un film est <b>vraiment</b> en VF : je vérifie les fichiers pour toi.</p>
                    </div>
                  )}
                  {items.map((m) => (
                    <motion.div
                      key={m.id}
                      className={`nox-msg nox-${m.role}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {m.role === 'nox' ? rich(m.text) : m.text}
                    </motion.div>
                  ))}
                  {busy && <div className="nox-typing"><span /><span /><span /></div>}
                </div>
                {items.length === 0 && (
                  <div className="nox-suggest">
                    {suggestions().map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
                  </div>
                )}
                {voiceError && <div className="nox-voice-error">{voiceError}</div>}
                <div className="nox-input">
                  {recording || voice === 'transcribing' ? (
                    <div className={`nox-listen ${voice}`}>
                      <div className="nox-wave" aria-hidden>
                        {[0.55, 0.85, 1, 0.75, 0.5, 0.9, 0.65].map((k, i) => (
                          <span key={i} style={{ transform: `scaleY(${voice === 'transcribing' ? 0.25 : Math.max(0.12, Math.min(1, level * k * 1.6))})` }} />
                        ))}
                      </div>
                      <span className="nox-listen-label">
                        {voice === 'transcribing' ? 'Je t\'ai entendu, je note…' : voice === 'speaking' ? 'Je t\'écoute…' : 'Parle, je t\'écoute 🦉'}
                      </span>
                      {recording && <button className="nox-icon" onClick={() => rec.current?.cancel()} title="Annuler (Échap)"><X size={16} /></button>}
                    </div>
                  ) : (
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={text}
                      placeholder="Pose ta question à Nox…"
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    />
                  )}
                  {text.trim() && !recording && voice !== 'transcribing' ? (
                    <button className="nox-send" disabled={busy} onClick={() => send()} aria-label="Envoyer"><ArrowUp size={18} /></button>
                  ) : (
                    <button
                      className={`nox-mic ${recording ? 'is-on' : ''}`}
                      disabled={busy || voice === 'transcribing'}
                      onClick={talk}
                      aria-label={recording ? 'Terminer' : 'Parler à Nox'}
                      title={recording ? 'Terminer (Nox s\'arrête aussi tout seul quand tu as fini de parler)' : 'Parler à Nox'}
                      style={recording ? { boxShadow: `0 0 0 ${3 + level * 10}px rgba(229, 9, 20, 0.28)` } : undefined}
                    >
                      {recording ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Première ouverture : la clé API Google (gratuite) */
function NoxSetup({ onDone, onSettings }: { onDone: (key: string) => void; onSettings: () => void }) {
  const [key, setKey] = useState('');
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const test = async () => {
    const k = key.trim();
    if (!k) return;
    setState({ busy: true });
    const r = await window.nocta!.assistant.testKey(k);
    if (r.ok) onDone(k);
    else setState({ error: r.error });
  };
  return (
    <div className="nox-setup">
      <p>Pour me réveiller, il me faut une <b>clé API Google</b> (Gemini). C'est <b>gratuit</b>, et elle reste sur ce PC.</p>
      <ol>
        <li>Va sur <a onClick={() => window.nocta?.openExternal('https://aistudio.google.com/apikey')}>Google AI Studio</a>, connecte-toi et clique sur <i>Create API key</i>.</li>
        <li>Copie la clé et colle-la ici.</li>
      </ol>
      <input className="input" type="password" placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && test()} />
      {state.error && <div className="status err">{state.error}</div>}
      <div className="nox-setup-actions">
        <button className="btn btn-white" disabled={state.busy || !key.trim()} onClick={test}>{state.busy ? 'Vérification…' : 'Réveiller Nox'}</button>
        <button className="btn-link" onClick={onSettings}>Paramètres</button>
      </div>
    </div>
  );
}
