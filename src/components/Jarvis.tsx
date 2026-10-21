import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';
import { startJarvis, stopJarvis, useJarvis } from '../lib/jarvis';
import { noxKeys } from '../lib/noxKeys';
import { useNox } from '../lib/nox';
import { useStore } from '../lib/store';
import { NoxOwl } from './Nox';

/**
 * Mode Jarvis (fenêtre principale) : démarre / arrête l'écoute selon les réglages, et affiche
 * dans les menus un petit témoin « Nox t'écoute » avec la phrase comprise.
 */
export function JarvisHost() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const player = useStore((s) => s.player);
  const { status, level, heard, error } = useJarvis();
  const noxOpen = useNox((s) => s.open);
  const canHear = noxKeys(settings).some((k) => k.provider === 'groq' || k.provider === 'gemini');
  const on = settings.jarvis !== false && canHear && settings.noxVisible !== false;

  useEffect(() => {
    if (on) startJarvis(); else stopJarvis();
  }, [on]);
  useEffect(() => () => stopJarvis(), []);

  // Phrase comprise : affichée quelques secondes
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!heard) return;
    setShown(heard);
    const t = setTimeout(() => setShown(''), 4500);
    return () => clearTimeout(t);
  }, [heard, status === 'heard']);

  if (player || !canHear || settings.noxVisible === false || noxOpen) return null;
  const listening = on && status !== 'off' && status !== 'error';
  return (
    <div className="jarvis" data-nav-skip>
      <button
        className={`jarvis-pill ${listening ? 'is-on' : ''} ${status === 'speech' ? 'is-speech' : ''}`}
        onClick={() => update({ jarvis: !on })}
        title={on ? 'Mode Jarvis : dis « Nox, … » à tout moment (cliquer pour couper le micro)' : 'Activer le mode Jarvis'}
      >
        {listening ? (
          <span className="jarvis-bars" aria-hidden>
            {[0.6, 1, 0.75].map((k, i) => <i key={i} style={{ transform: `scaleY(${Math.max(0.25, Math.min(1, level * k * 2.2))})` }} />)}
          </span>
        ) : on ? <Mic size={13} /> : <MicOff size={13} />}
        <span>{status === 'error' ? error : !on ? 'Jarvis coupé' : status === 'thinking' ? 'Nox s\'en occupe…' : 'Dis « Nox… »'}</span>
      </button>
      <AnimatePresence>
        {shown && (
          <motion.div className="jarvis-heard" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}>
            <NoxOwl size={26} thinking={status === 'thinking'} />
            <span>« {shown} »</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Bulle de Nox par-dessus le film (fenêtre du lecteur) */
export function JarvisBubble({ data }: { data?: { state: 'listening' | 'thinking' | 'answer' | 'done' | 'action'; heard?: string; text?: string; resumeIn?: number; at: number } | null }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (data?.state !== 'done' || !data.resumeIn) { setCount(null); return; }
    setCount(data.resumeIn);
    const iv = setInterval(() => setCount((c) => (c && c > 1 ? c - 1 : c)), 1000);
    return () => clearInterval(iv);
  }, [data?.state, data?.at]);
  // La réponse reste affichée pendant le compte à rebours
  const [last, setLast] = useState<typeof data>(null);
  useEffect(() => { if (data && data.state !== 'done') setLast(data); if (!data) setLast(null); }, [data]);
  const show = data ? (data.state === 'done' ? last : data) : null;

  return (
    <AnimatePresence>
      {data && show && (
        <motion.div
          className={`jarvis-bubble is-${show.state}`}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <NoxOwl size={46} thinking={show.state === 'thinking'} />
          <div className="jarvis-bubble-body">
            {show.heard && <small>« {show.heard} »</small>}
            {show.state === 'listening' && <p>Oui ? Je t'écoute…</p>}
            {show.state === 'thinking' && <p className="jarvis-dots"><span /><span /><span /></p>}
            {(show.state === 'answer' || show.state === 'action') && <p>{(show.text || '').replace(/\*\*/g, '')}</p>}
            {data.state === 'done' && count != null && (
              <div className="jarvis-resume">
                <span>Reprise dans {count} s</span>
                <button onClick={() => window.nocta?.player.action('jarvis', { stay: true })}>Rester en pause</button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
