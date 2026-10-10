import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Gauge, Loader2, Maximize, MessageSquareText, Minimize, Minus, Pause, Play,
  RotateCcw, RotateCw, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { formatTime } from '../lib/playback';
import { langName } from '../lib/subs';
import type { MetaPreview } from '../lib/types';
import { LoadingScreen } from './LoadingScreen';

// Interface du lecteur affichée par-dessus mpv (fenêtre transparente)

interface InitPayload {
  src: string;
  title: string;
  subtitle?: string;
  meta?: MetaPreview;
  volume?: number;
}

interface Track {
  id: number;
  type: 'video' | 'audio' | 'sub';
  lang?: string;
  title?: string;
  codec?: string;
  selected?: boolean;
  external?: boolean;
  'external-filename'?: string;
  'demux-channel-count'?: number;
  forced?: boolean;
}

interface Info {
  extSubs?: { url: string; lang: string; addon: string }[];
  next?: { label: string } | null;
  status?: string;
  progress?: number;
  autoplayNext?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const bridge = () => window.nocta!.player;
const cmd = (...a: any[]) => bridge().cmd(...a);

export function MpvOverlay() {
  const [init, setInit] = useState<InitPayload | null>(null);
  const [info, setInfo] = useState<Info>({});
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cacheTime, setCacheTime] = useState(0);
  const [paused, setPaused] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [audioDelay, setAudioDelay] = useState(0);
  const [subDelay, setSubDelay] = useState(0);
  const [eof, setEof] = useState(false);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState<'tracks' | 'speed' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [flash, setFlash] = useState<{ n: number; icon: 'play' | 'pause' | 'fwd' | 'back' } | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<{ x: number; t: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const addedSubs = useRef(new Map<string, true>());
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    document.documentElement.classList.add('overlay-mode');
    const offs = [
      bridge().on('player:init', (p: InitPayload) => {
        setInit(p);
        setStarted(false);
        setError(null);
        setEof(false);
        setCountdown(null);
        setTime(0);
        setInfo({});
        addedSubs.current.clear();
        if (p.volume != null) setVolume(Math.round(p.volume * 100));
      }),
      bridge().on('player:info', (i: Info) => setInfo((prev) => ({ ...prev, ...i }))),
      bridge().on('mpv:event', ({ name, value }: { name: string; value: any }) => {
        switch (name) {
          case 'time-pos': if (typeof value === 'number') setTime(value); break;
          case 'duration': if (typeof value === 'number') setDuration(value); break;
          case 'demuxer-cache-time': if (typeof value === 'number') setCacheTime(value); break;
          case 'pause': setPaused(!!value); break;
          case 'paused-for-cache': setBuffering(!!value); break;
          case 'seeking': setSeeking(!!value); break;
          case 'volume': if (typeof value === 'number') setVolume(Math.round(value)); break;
          case 'mute': setMuted(!!value); break;
          case 'speed': if (typeof value === 'number') setSpeed(value); break;
          case 'track-list': setTracks(Array.isArray(value) ? value : []); break;
          case 'audio-delay': if (typeof value === 'number') setAudioDelay(value); break;
          case 'sub-delay': if (typeof value === 'number') setSubDelay(value); break;
          case 'eof-reached': setEof(!!value); break;
          case 'playback-restart': setStarted(true); break;
          case 'end-file':
            if (value === 'error') setError('Impossible de lire cette vidéo (lien expiré ou fichier illisible).');
            break;
        }
      }),
    ];
    bridge().ready();
    return () => offs.forEach((o) => o());
  }, []);

  const pos = scrub ?? time;
  const remaining = duration ? duration - pos : Infinity;

  // ---------- Actions ----------
  const togglePlay = useCallback(() => {
    cmd('cycle', 'pause');
    setFlash({ n: Date.now(), icon: paused ? 'play' : 'pause' });
  }, [paused]);

  const seekTo = (t: number) => cmd('seek', Math.max(0, t), 'absolute');
  const skip = (d: number) => {
    cmd('seek', d, 'relative');
    setFlash({ n: Date.now(), icon: d > 0 ? 'fwd' : 'back' });
  };
  const setVol = (v: number) => {
    const x = Math.max(0, Math.min(100, Math.round(v)));
    cmd('set_property', 'volume', x);
    cmd('set_property', 'mute', x === 0);
  };
  const toggleMute = () => cmd('set_property', 'mute', !muted);
  const toggleFullscreen = async () => setFullscreen(await bridge().fullscreen());
  const close = () => bridge().close();
  const goNext = () => { setCountdown(null); bridge().next(); };

  const selectAudio = (id: number) => { cmd('set_property', 'aid', id); };
  const selectSub = (id: number | 'no') => { cmd('set_property', 'sid', id); setPanel(null); };
  const addExtSub = async (s: { url: string; lang: string; addon: string }) => {
    setPanel(null);
    const existing = tracks.find((t) => t.type === 'sub' && t['external-filename'] === s.url);
    if (existing) return selectSub(existing.id);
    if (addedSubs.current.has(s.url)) return;
    addedSubs.current.set(s.url, true);
    await cmd('sub-add', s.url, 'select', `${langName(s.lang)} · ${s.addon}`, s.lang);
  };

  // ---------- Fin / épisode suivant ----------
  useEffect(() => {
    if (eof && info.next && info.autoplayNext !== false && countdown == null) setCountdown(5);
  }, [eof, info.next, info.autoplayNext, countdown]);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) { goNext(); return; }
    const t = setTimeout(() => setCountdown((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ---------- Masquage automatique ----------
  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 2800);
  }, []);
  useEffect(() => {
    if (paused || panel || !started) { setControls(true); clearTimeout(hideTimer.current); } else poke();
  }, [paused, panel, started, poke]);

  // ---------- Clavier ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      poke();
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowUp': e.preventDefault(); setVol(volume + 5); break;
        case 'ArrowDown': e.preventDefault(); setVol(volume - 5); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': toggleMute(); break;
        case 'n': case 'N': if (info.next) goNext(); break;
        case 'Escape':
          if (panel) setPanel(null);
          else if (fullscreen) toggleFullscreen();
          else close();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Barre de progression ----------
  const barRef = useRef<HTMLDivElement>(null);
  const fracAt = (x: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };

  const audios = tracks.filter((t) => t.type === 'audio');
  const subs = tracks.filter((t) => t.type === 'sub');
  const activeSub = subs.find((t) => t.selected);
  const extSubs = useMemo(() => (info.extSubs || []).filter((s) => !subs.some((t) => t['external-filename'] === s.url)).slice(0, 40), [info.extSubs, subs]);

  const pct = duration ? (pos / duration) * 100 : 0;
  const bufPct = duration ? Math.min(100, (cacheTime / duration) * 100) : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const showLoading = !started && !error;

  if (!init) return <div className="overlay-root" />;

  return (
    <div className={`overlay-root player ${controls ? '' : 'hide-ui'}`} onMouseMove={poke}>
      <div className="overlay-hit" onClick={() => (panel ? setPanel(null) : togglePlay())} onDoubleClick={toggleFullscreen} />

      <AnimatePresence>
        {showLoading && (
          <LoadingScreen
            key="loading"
            info={{ meta: init.meta, title: init.title, subtitle: init.subtitle, status: info.status || 'Chargement de la vidéo…', progress: info.progress }}
            onBack={close}
          />
        )}
      </AnimatePresence>

      {started && (buffering || seeking) && !error && <div className="player-center"><div className="ring" /></div>}

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.n}
            className="player-flash"
            initial={{ opacity: 0.9, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.6 }}
            onAnimationComplete={() => setFlash(null)}
          >
            {flash.icon === 'play' && <Play size={56} fill="currentColor" />}
            {flash.icon === 'pause' && <Pause size={56} fill="currentColor" />}
            {flash.icon === 'fwd' && <RotateCw size={56} />}
            {flash.icon === 'back' && <RotateCcw size={56} />}
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="player-error">
          <h2>Oups.</h2>
          <p>{error}</p>
          <div><button className="btn btn-white" onClick={close}>Retour</button></div>
        </div>
      )}

      {started && (
        <>
          <div className="player-top">
            <button className="player-btn" onClick={close} aria-label="Retour"><ArrowLeft size={34} /></button>
            <div className="win-btns">
              <button className="player-btn small" onClick={() => bridge().minimize()} title="Réduire"><Minus size={22} /></button>
              <button className="player-btn small" onClick={toggleFullscreen} title="Plein écran">
                {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {info.next && (remaining < 35 || countdown != null || info.status) && duration > 300 && (
              <motion.button
                className="next-card"
                onClick={goNext}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
              >
                {info.status ? <Loader2 className="spin" size={20} /> : <SkipForward size={20} fill="currentColor" />}
                <div>
                  <strong>{info.status || (countdown != null ? `Épisode suivant dans ${countdown}` : 'Épisode suivant')}</strong>
                  <span>{info.next.label}</span>
                </div>
                {countdown != null && <div className="next-fill" style={{ animationDuration: '5s' }} />}
              </motion.button>
            )}
          </AnimatePresence>

          <div className="player-bottom">
            <div className="seek">
              <div
                className="seek-bar"
                ref={barRef}
                onPointerDown={(e) => {
                  if (!duration) return;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setScrub(fracAt(e.clientX) * duration);
                }}
                onPointerMove={(e) => {
                  if (!duration) return;
                  const f = fracAt(e.clientX);
                  setHoverX({ x: f * 100, t: f * duration });
                  if (scrub != null) setScrub(f * duration);
                }}
                onPointerUp={(e) => {
                  if (scrub == null) return;
                  const t = fracAt(e.clientX) * duration;
                  setScrub(null);
                  setTime(t);
                  seekTo(t);
                }}
                onPointerLeave={() => setHoverX(null)}
              >
                <div className="seek-track">
                  <div className="seek-buf" style={{ width: `${bufPct}%` }} />
                  <div className="seek-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="seek-knob" style={{ left: `${pct}%` }} />
                {hoverX && <div className="seek-tip" style={{ left: `${hoverX.x}%` }}>{formatTime(hoverX.t)}</div>}
              </div>
              <span className="seek-time">{duration ? formatTime(Math.max(0, duration - pos)) : formatTime(pos)}</span>
            </div>

            <div className="player-row">
              <button className="player-btn" onClick={togglePlay} aria-label="Lecture/Pause">
                {paused ? <Play size={34} fill="currentColor" /> : <Pause size={34} fill="currentColor" />}
              </button>
              <button className="player-btn" onClick={() => skip(-10)} aria-label="Reculer de 10 s"><RotateCcw size={30} /><span className="ten">10</span></button>
              <button className="player-btn" onClick={() => skip(10)} aria-label="Avancer de 10 s"><RotateCw size={30} /><span className="ten">10</span></button>
              <div className="vol">
                <button className="player-btn" onClick={toggleMute} aria-label="Son"><VolIcon size={30} /></button>
                <input
                  type="range" min={0} max={100} step={1}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(Number(e.target.value))}
                  style={{ ['--v' as any]: `${muted ? 0 : volume}%` }}
                />
              </div>

              <div className="player-title">
                <strong>{init.title}</strong>
                {init.subtitle && <span>{init.subtitle}</span>}
              </div>

              {info.next && <button className="player-btn" onClick={goNext} title="Épisode suivant (N)"><SkipForward size={30} /></button>}

              <div className="pop-wrap">
                <button className="player-btn" onClick={() => setPanel(panel === 'tracks' ? null : 'tracks')} title="Audio et sous-titres">
                  <MessageSquareText size={30} />
                </button>
                <AnimatePresence>
                  {panel === 'tracks' && (
                    <motion.div className="pop pop-tracks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                      <div className="pop-col">
                        <h4>Audio</h4>
                        {audios.length === 0 && <p className="muted">Aucune piste</p>}
                        {audios.map((a) => (
                          <button key={a.id} className={a.selected ? 'is-on' : ''} onClick={() => selectAudio(a.id)}>
                            {langName(a.lang)} {a.title && <small>{a.title}</small>}
                            <small>
                              {(a.codec || '').toUpperCase()}
                              {a['demux-channel-count'] && a['demux-channel-count'] > 2
                                ? ` ${a['demux-channel-count'] === 6 ? '5.1' : a['demux-channel-count'] === 8 ? '7.1' : a['demux-channel-count'] + 'ch'}`
                                : ''}
                            </small>
                          </button>
                        ))}
                        <div className="delay-row">
                          <span>Synchro audio</span>
                          <button onClick={() => cmd('add', 'audio-delay', -0.1)}>−</button>
                          <em>{audioDelay >= 0 ? '+' : ''}{audioDelay.toFixed(1)} s</em>
                          <button onClick={() => cmd('add', 'audio-delay', 0.1)}>+</button>
                        </div>
                      </div>
                      <div className="pop-col">
                        <h4>Sous-titres</h4>
                        <button className={!activeSub ? 'is-on' : ''} onClick={() => selectSub('no')}>Désactivés</button>
                        {subs.map((t) => (
                          <button key={t.id} className={t.selected ? 'is-on' : ''} onClick={() => selectSub(t.id)}>
                            {t.external ? (t.title || langName(t.lang)) : langName(t.lang)}
                            {!t.external && t.title && <small>{t.title}</small>}
                            {t.forced && <small>forcés</small>}
                          </button>
                        ))}
                        {extSubs.map((s) => (
                          <button key={s.url} onClick={() => addExtSub(s)}>
                            {langName(s.lang)} <small>{s.addon}</small>
                          </button>
                        ))}
                        {activeSub && (
                          <div className="delay-row">
                            <span>Synchro sous-titres</span>
                            <button onClick={() => cmd('add', 'sub-delay', -0.1)}>−</button>
                            <em>{subDelay >= 0 ? '+' : ''}{subDelay.toFixed(1)} s</em>
                            <button onClick={() => cmd('add', 'sub-delay', 0.1)}>+</button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="pop-wrap">
                <button className="player-btn" onClick={() => setPanel(panel === 'speed' ? null : 'speed')} title="Vitesse"><Gauge size={30} /></button>
                <AnimatePresence>
                  {panel === 'speed' && (
                    <motion.div className="pop pop-speed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                      <h4>Vitesse de lecture</h4>
                      <div className="speeds">
                        {SPEEDS.map((s) => (
                          <button key={s} className={Math.abs(speed - s) < 0.01 ? 'is-on' : ''} onClick={() => cmd('set_property', 'speed', s)}>
                            <span className="dot" />{s === 1 ? '1x (normale)' : `${s}x`}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button className="player-btn" onClick={toggleFullscreen} aria-label="Plein écran">
                {fullscreen ? <Minimize size={30} /> : <Maximize size={30} />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
