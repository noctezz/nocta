import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { Meta } from '../lib/types';
import { useStore } from '../lib/store';

/** ID YouTube de la bande-annonce fournie par l'addon de métadonnées (Cinemeta) */
export function trailerIdOf(meta: Meta): string | null {
  const m = meta as Meta & {
    trailerStreams?: { ytId?: string }[];
    trailers?: { source?: string; type?: string }[];
  };
  const fromStreams = m.trailerStreams?.find((t) => t.ytId)?.ytId;
  if (fromStreams) return fromStreams;
  const t = m.trailers?.find((x) => x.source && (!x.type || /trailer/i.test(x.type))) || m.trailers?.find((x) => x.source);
  return t?.source || null;
}

/**
 * Bande-annonce qui remplace l'image de la fiche après un court délai, comme sur Netflix :
 * sans son par défaut, bouton son, rejouer à la fin.
 */
export function TrailerPreview({ meta, paused, delay = 1500, compact = false }: { meta: Meta; paused?: boolean; delay?: number; compact?: boolean }) {
  const enabled = useStore((s) => s.settings.autoplayTrailers !== false);
  const ytId = trailerIdOf(meta);
  const frame = useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [round, setRound] = useState(0);

  // Démarre après 1,5 s pour laisser respirer l'ouverture de la fiche
  useEffect(() => {
    setStarted(false);
    setVisible(false);
    setEnded(false);
    if (!ytId || !enabled) return;
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [ytId, enabled, round, delay]);

  // Événements du lecteur YouTube (API iframe via postMessage)
  useEffect(() => {
    if (!started) return;
    const onMsg = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
      let data: any = e.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      const state = data?.info?.playerState ?? (data?.event === 'onStateChange' ? data.info : undefined);
      if (state === 1) setVisible(true); // lecture
      if (state === 0) { setEnded(true); setVisible(false); } // fin
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [started]);

  const post = (func: string) =>
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');

  useEffect(() => { if (started) post(paused ? 'pauseVideo' : 'playVideo'); }, [paused, started]);

  if (!ytId || !enabled) return null;

  const onLoad = () => {
    // Abonnement aux changements d'état du lecteur
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'nocta' }), '*');
    // Repli si aucun événement n'arrive : on affiche quand même après un délai
    setTimeout(() => setVisible(true), 2200);
  };

  const params = new URLSearchParams({
    autoplay: '1', mute: '1', controls: '0', rel: '0', modestbranding: '1', playsinline: '1',
    iv_load_policy: '3', disablekb: '1', fs: '0', enablejsapi: '1', start: '0',
  });

  return (
    <>
      {started && !ended && (
        <div className={`trailer ${visible ? 'is-visible' : ''}`}>
          <iframe
            key={round}
            ref={frame}
            src={`https://www.youtube-nocookie.com/embed/${ytId}?${params}`}
            title="Bande-annonce"
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={onLoad}
          />
        </div>
      )}
      {started && visible && !ended && (
        <button
          className={`round trailer-btn ${compact ? 'is-compact' : ''}`}
          onClick={(e) => { e.stopPropagation(); post(muted ? 'unMute' : 'mute'); setMuted(!muted); }}
          title={muted ? 'Activer le son' : 'Couper le son'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}
      {ended && (
        <button className={`round trailer-btn ${compact ? 'is-compact' : ''}`} onClick={(e) => { e.stopPropagation(); setMuted(true); setRound((r) => r + 1); }} title="Revoir la bande-annonce">
          <RotateCcw size={18} />
        </button>
      )}
    </>
  );
}
