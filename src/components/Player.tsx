import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Gauge, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw,
  MessageSquareText, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { useLatest } from '../lib/useLatest';
import { LoadingScreen } from './LoadingScreen';
import { useStore } from '../lib/store';
import { getMeta, getSubtitles, type SubtitleTrack } from '../lib/addons';
import { episodeLabel, errMsg, formatTime, nextEpisode, recordProgress, resolveNextEpisode, slimMeta } from '../lib/playback';
import { langMatches, langName, parseVtt, type Cue } from '../lib/subs';
import type { Meta, Video } from '../lib/types';

type Mode = 'direct' | 'remux' | 'full';

const VIDEO_OK = ['h264', 'vp8', 'vp9', 'av1'];
const AUDIO_OK = ['aac', 'mp3', 'opus', 'vorbis', 'flac'];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type SubChoice = { kind: 'internal'; index: number; label: string } | { kind: 'external'; url: string; label: string } | null;

export function Player() {
  const req = useLatest(useStore((s) => s.player))!;
  const closePlayer = useStore((s) => s.closePlayer);
  const play = useStore((s) => s.play);
  const openPicker = useStore((s) => s.openPicker);
  const removeProgress = useStore((s) => s.removeProgress);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const addons = useStore((s) => s.addons);
  const toast = useStore((s) => s.toast);

  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [port, setPort] = useState(0);
  const [hasFfmpeg, setHasFfmpeg] = useState(false);
  const [probe, setProbe] = useState<NoctaProbe | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('direct');
  const [offset, setOffset] = useState(0);
  const [audioIdx, setAudioIdx] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controls, setControls] = useState(true);
  const [panel, setPanel] = useState<'tracks' | 'speed' | null>(null);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(settings.volume);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [flash, setFlash] = useState<{ n: number; icon: 'play' | 'pause' | 'fwd' | 'back' } | null>(null);
  const [extSubs, setExtSubs] = useState<SubtitleTrack[]>([]);
  const [sub, setSub] = useState<SubChoice>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [fullMeta, setFullMeta] = useState<Meta | null>(null);
  const [nextBusy, setNextBusy] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<{ x: number; t: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingSeek = useRef<number | null>(null);
  const triedModes = useRef<Set<Mode>>(new Set());

  const isLocal = !/^https?:\/\//i.test(req.src);
  const duration = probe?.duration || mediaDuration || 0;
  const absTime = scrub ?? offset + time;

  // ---------- Initialisation : port du serveur média + analyse du fichier ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!window.nocta) {
        setReady(true);
        return;
      }
      const [p, caps] = await Promise.all([window.nocta.media.port(), window.nocta.media.capabilities()]);
      if (!alive) return;
      setPort(p);
      setHasFfmpeg(caps.ffmpeg);
      const pr = caps.ffmpeg ? await window.nocta.media.probe(req.src) : null;
      if (!alive) return;
      setProbe(pr && pr.ok ? pr : null);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [req.src]);

  const directUrl = useMemo(() => {
    if (!isLocal) return req.src;
    return port ? `http://127.0.0.1:${port}/file?path=${encodeURIComponent(req.src)}` : '';
  }, [isLocal, req.src, port]);

  const streamUrl = useCallback((m: Mode, t: number, a: number | null) => {
    const p = new URLSearchParams({ src: req.src, t: String(t), mode: m === 'full' ? 'full' : 'remux', enc: settings.encoder });
    if (a != null) p.set('a', String(a));
    if (probe?.video?.codec === 'hevc') p.set('hevc', '1');
    return `http://127.0.0.1:${port}/stream?${p}`;
  }, [req.src, port, settings.encoder, probe]);

  /** Charge la vidéo dans un mode donné, à partir d'une position absolue */
  const loadSeq = useRef(0);
  const load = useCallback(async (m: Mode, t: number, a: number | null) => {
    const v = videoRef.current;
    if (!v) return;
    const seq = ++loadSeq.current;
    triedModes.current.add(m);
    setMode(m);
    setError(null);
    setWaiting(true);
    // En remux, ffmpeg repart de l'image-clé précédente : on s'aligne dessus
    if (m === 'remux' && t > 0 && window.nocta) {
      t = await window.nocta.media.keyframe(req.src, t);
      if (seq !== loadSeq.current) return;
    }
    if (m === 'direct') {
      setOffset(0);
      pendingSeek.current = t > 0 ? t : null;
      v.src = directUrl;
    } else {
      setOffset(t);
      setTime(0);
      pendingSeek.current = null;
      v.src = streamUrl(m, t, a);
    }
    v.play().catch(() => {});
  }, [directUrl, streamUrl, req.src]);

  // Choix initial du mode de lecture selon les codecs
  useEffect(() => {
    if (!ready) return;
    const start = req.startAt && req.startAt > 5 ? req.startAt - 3 : 0;
    if (!probe || !hasFfmpeg) {
      load('direct', start, null);
      return;
    }
    const v = probe.video;
    const preferred = probe.audios.find((a) => langMatches(a.lang, settings.preferredSubLang));
    const defAudio = probe.audios.find((a) => a.isDefault) || probe.audios[0];
    const chosen = preferred || defAudio;
    const vOK = !v || (VIDEO_OK.includes(v.codec) && !(v.codec === 'h264' && /1[02]/.test(v.pixFmt)));
    const aOK = !chosen || AUDIO_OK.includes(chosen.codec);
    const cOK = /mp4|mov|webm|matroska/.test(probe.format);
    const firstAudio = probe.audios[0];
    const needsTrack = !!(chosen && firstAudio && chosen.index !== firstAudio.index);
    setAudioIdx(chosen ? chosen.index : null);
    if (vOK && aOK && cOK && !needsTrack) load('direct', start, null);
    else if (vOK || v?.codec === 'hevc') load('remux', start, chosen ? chosen.index : null);
    else load('full', start, chosen ? chosen.index : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---------- Événements vidéo ----------
  const onError = () => {
    const order: Mode[] = ['direct', 'remux', 'full'];
    const next = hasFfmpeg ? order.find((m) => !triedModes.current.has(m)) : undefined;
    if (next) {
      load(next, offset + (videoRef.current?.currentTime || 0), audioIdx);
    } else {
      setWaiting(false);
      setError('Impossible de lire cette vidéo (format non pris en charge ou lien expiré).');
    }
  };

  const onLoadedMetadata = () => {
    const v = videoRef.current!;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = speed;
    if (isFinite(v.duration)) setMediaDuration(v.duration);
    // Vidéo sans image (codec vidéo non décodable) -> mode suivant
    if (v.videoWidth === 0 && probe?.video && mode !== 'full') {
      onError();
      return;
    }
    if (pendingSeek.current != null) {
      v.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current!;
    setTime(v.currentTime);
    if (v.buffered.length) setBuffered(offset + v.buffered.end(v.buffered.length - 1));
  };

  // ---------- Actions ----------
  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const target = Math.max(0, duration ? Math.min(t, duration - 1) : t);
    if (mode === 'direct') {
      v.currentTime = target;
    } else {
      // Dans la plage déjà chargée : déplacement direct, sinon on relance ffmpeg
      const rel = target - offset;
      const bufEnd = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
      if (rel >= 0 && rel <= bufEnd) v.currentTime = rel;
      else load(mode, target, audioIdx);
    }
  }, [mode, offset, duration, load, audioIdx]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setFlash({ n: Date.now(), icon: 'play' }); }
    else { v.pause(); setFlash({ n: Date.now(), icon: 'pause' }); }
  }, []);

  const skip = useCallback((d: number) => {
    seek(offset + (videoRef.current?.currentTime || 0) + d);
    setFlash({ n: Date.now(), icon: d > 0 ? 'fwd' : 'back' });
  }, [seek, offset]);

  const setVol = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    setVolume(x);
    setMuted(x === 0);
    if (videoRef.current) { videoRef.current.volume = x; videoRef.current.muted = x === 0; }
  };

  const toggleFullscreen = useCallback(async () => {
    if (window.nocta) setFullscreen(await window.nocta.win.toggleFullscreen());
    else if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false); }
    else { await rootRef.current?.requestFullscreen(); setFullscreen(true); }
  }, []);

  useEffect(() => window.nocta?.win.onFullscreen(setFullscreen), []);

  // Lecture en plein écran ; l'état d'avant est rétabli en quittant le lecteur
  const prevFullscreen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!window.nocta) return;
    window.nocta.win.isFullscreen().then((was) => {
      if (prevFullscreen.current == null) prevFullscreen.current = was;
      if (!was) window.nocta!.win.setFullscreen(true).then(setFullscreen);
      else setFullscreen(true);
    });
  }, []);

  const pickAudio = (index: number) => {
    setAudioIdx(index);
    setPanel(null);
    const t = offset + (videoRef.current?.currentTime || 0);
    load(mode === 'direct' ? 'remux' : mode, t, index);
  };

  // ---------- Sauvegarde de la progression ----------
  const nextRef = useRef<Video | null>(null);
  const saveNow = useCallback(() => {
    if (!req.meta || !duration) return;
    recordProgress(req, offset + (videoRef.current?.currentTime || 0), duration, nextRef.current);
  }, [req, duration, offset]);

  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;
  useEffect(() => {
    const i = setInterval(() => saveRef.current(), 5000);
    return () => { clearInterval(i); saveRef.current(); };
  }, []);

  const close = useCallback(() => {
    saveRef.current();
    updateSettings({ volume });
    if (prevFullscreen.current === false) window.nocta?.win.setFullscreen(false);
    closePlayer();
  }, [closePlayer, fullscreen, updateSettings, volume]);

  // ---------- Sous-titres ----------
  useEffect(() => {
    if (!req.type || !req.videoId) return;
    getSubtitles(addons, req.type, req.videoId).then(setExtSubs).catch(() => {});
  }, [addons, req.type, req.videoId]);

  useEffect(() => {
    setCues([]);
    if (!sub || !port) return;
    let alive = true;
    setSubLoading(true);
    const url = sub.kind === 'internal'
      ? `http://127.0.0.1:${port}/subs?src=${encodeURIComponent(req.src)}&i=${sub.index}`
      : `http://127.0.0.1:${port}/subs?src=${encodeURIComponent(sub.url)}`;
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        if (!alive) return;
        const parsed = parseVtt(t);
        setCues(parsed);
        if (!parsed.length) toast('Sous-titres vides ou illisibles', 'error');
      })
      .catch(() => alive && toast('Impossible de charger les sous-titres', 'error'))
      .finally(() => alive && setSubLoading(false));
    return () => { alive = false; };
  }, [sub, port, req.src, toast]);

  const activeCues = useMemo(() => cues.filter((c) => absTime >= c.start && absTime <= c.end), [cues, absTime]);

  const internalSubs = (probe?.subs || []).filter((s) => s.text);
  const extSorted = useMemo(() => {
    const pref = extSubs.filter((s) => langMatches(s.lang, settings.preferredSubLang));
    const rest = extSubs.filter((s) => !langMatches(s.lang, settings.preferredSubLang));
    return [...pref, ...rest].slice(0, 40);
  }, [extSubs, settings.preferredSubLang]);

  // ---------- Épisode suivant ----------
  useEffect(() => {
    if (req.type !== 'series' || !req.meta) return;
    getMeta(addons, req.type, req.meta.id).then(setFullMeta).catch(() => {});
  }, [addons, req.type, req.meta]);

  const next: Video | null = useMemo(
    () => (fullMeta && req.videoId ? nextEpisode(fullMeta, req.videoId) : null),
    [fullMeta, req.videoId],
  );

  const goNext = useCallback(async () => {
    if (!next || !fullMeta || nextBusy) return;
    setCountdown(null);
    saveRef.current();
    const ep = next.episode ?? next.number;
    const epTitle = `${episodeLabel(next)} « ${next.title || next.name || `Épisode ${ep}`} »`;
    const toPicker = () => {
      closePlayer();
      openPicker({ meta: slimMeta(fullMeta), type: 'series', videoId: next.id, season: next.season, episode: ep, episodeTitle: epTitle });
    };
    try {
      setNextBusy('Recherche de l\'épisode suivant…');
      const nextReq = await resolveNextEpisode(fullMeta, next, req, (text) => setNextBusy(text));
      if (!nextReq) { setNextBusy(null); return toPicker(); }
      removeProgress(req.meta!.id);
      play({ ...nextReq, subtitle: epTitle });
    } catch (e) {
      setNextBusy(null);
      toast(errMsg(e), 'error');
      toPicker();
    }
  }, [next, fullMeta, nextBusy, req, addons, closePlayer, openPicker, play, removeProgress, toast]);

  nextRef.current = next;
  const remaining = duration ? duration - absTime : Infinity;
  const showNextCard = !!next && remaining < 35 && duration > 300;

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) { goNext(); return; }
    const t = setTimeout(() => setCountdown((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, goNext]);

  const onEnded = () => {
    if (next && settings.autoplayNext) setCountdown(5);
    else if (!next) { saveRef.current(); }
  };

  // ---------- Masquage automatique des contrôles ----------
  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) setControls(false);
    }, 2800);
  }, []);

  useEffect(() => {
    if (!playing) setControls(true);
    else poke();
  }, [playing, poke]);

  useEffect(() => { if (panel) { setControls(true); clearTimeout(hideTimer.current); } else poke(); }, [panel, poke]);

  // ---------- Clavier ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      poke();
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': e.preventDefault(); skip(10); break;
        case 'ArrowLeft': e.preventDefault(); skip(-10); break;
        case 'ArrowUp': e.preventDefault(); setVol(volume + 0.1); break;
        case 'ArrowDown': e.preventDefault(); setVol(volume - 0.1); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': setVol(muted || volume === 0 ? Math.max(volume, 0.5) : 0); break;
        case 'n': case 'N': goNext(); break;
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
  const fracAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const onBarDown = (e: React.PointerEvent) => {
    if (!duration) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setScrub(fracAt(e.clientX) * duration);
  };
  const onBarMove = (e: React.PointerEvent) => {
    if (!duration) return;
    const f = fracAt(e.clientX);
    setHoverX({ x: f * 100, t: f * duration });
    if (scrub != null) setScrub(f * duration);
  };
  const onBarUp = (e: React.PointerEvent) => {
    if (scrub == null) return;
    const t = fracAt(e.clientX) * duration;
    setScrub(null);
    seek(t);
  };

  const pct = duration ? (absTime / duration) * 100 : 0;
  const bufPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <motion.div
      ref={rootRef}
      className={`player ${controls ? '' : 'hide-ui'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={poke}
    >
      <video
        ref={videoRef}
        className="player-video"
        onClick={() => (panel ? setPanel(null) : togglePlay())}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => { setWaiting(false); setStarted(true); }}
        onCanPlay={() => setWaiting(false)}
        onError={() => ready && onError()}
        onEnded={onEnded}
        playsInline
      />

      {/* Sous-titres */}
      <div className={`subs ${controls ? 'is-raised' : ''}`} style={{ fontSize: `calc(${settings.subtitleSize / 100} * clamp(18px, 2.6vw, 46px))` }}>
        {activeCues.map((c, i) => <div key={c.start + '-' + i} className="sub-line" dangerouslySetInnerHTML={{ __html: c.html }} />)}
      </div>

      {/* Écran de chargement jusqu'à la première image */}
      <AnimatePresence>
        {!started && !error && (
          <LoadingScreen
            key="loading"
            info={{ meta: req.meta, title: req.title, subtitle: req.subtitle, status: ready ? 'Chargement de la vidéo…' : 'Analyse du fichier…' }}
            onBack={close}
          />
        )}
      </AnimatePresence>

      {/* Mise en mémoire tampon */}
      {started && (waiting || !ready) && !error && (
        <div className="player-center">
          <div className="ring" />
        </div>
      )}

      {/* Flash play/pause */}
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
          <div>
            <button className="btn btn-white" onClick={() => { triedModes.current.clear(); load(hasFfmpeg ? 'full' : 'direct', absTime, audioIdx); }}>Réessayer</button>
            <button className="btn-outline" onClick={close}>Retour</button>
          </div>
        </div>
      )}

      {/* Haut */}
      <div className="player-top">
        <button className="player-btn" onClick={close} aria-label="Retour"><ArrowLeft size={34} /></button>
        {mode !== 'direct' && <span className="player-mode">{mode === 'full' ? 'Transcodage' : 'Remux'} · ffmpeg</span>}
      </div>

      {/* Épisode suivant */}
      <AnimatePresence>
        {(showNextCard || countdown != null || nextBusy) && next && (
          <motion.button
            className="next-card"
            onClick={goNext}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
          >
            {nextBusy ? <Loader2 className="spin" size={20} /> : <SkipForward size={20} fill="currentColor" />}
            <div>
              <strong>{nextBusy || (countdown != null ? `Épisode suivant dans ${countdown}` : 'Épisode suivant')}</strong>
              <span>{episodeLabel(next)} {next.title || next.name}</span>
            </div>
            {countdown != null && <div className="next-fill" style={{ animationDuration: '5s' }} />}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bas */}
      <div className="player-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="seek">
          <div
            className="seek-bar"
            ref={barRef}
            onPointerDown={onBarDown}
            onPointerMove={onBarMove}
            onPointerUp={onBarUp}
            onPointerLeave={() => setHoverX(null)}
          >
            <div className="seek-track">
              <div className="seek-buf" style={{ width: `${bufPct}%` }} />
              <div className="seek-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="seek-knob" style={{ left: `${pct}%` }} />
            {hoverX && <div className="seek-tip" style={{ left: `${hoverX.x}%` }}>{formatTime(hoverX.t)}</div>}
          </div>
          <span className="seek-time">{duration ? formatTime(Math.max(0, duration - absTime)) : formatTime(absTime)}</span>
        </div>

        <div className="player-row">
          <button className="player-btn" onClick={togglePlay} aria-label="Lecture/Pause">
            {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" />}
          </button>
          <button className="player-btn" onClick={() => skip(-10)} aria-label="Reculer de 10 s"><RotateCcw size={30} /><span className="ten">10</span></button>
          <button className="player-btn" onClick={() => skip(10)} aria-label="Avancer de 10 s"><RotateCw size={30} /><span className="ten">10</span></button>
          <div className="vol">
            <button className="player-btn" onClick={() => setVol(muted || volume === 0 ? Math.max(volume, 0.5) : 0)} aria-label="Son">
              <VolIcon size={30} />
            </button>
            <input
              type="range" min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              style={{ ['--v' as any]: `${(muted ? 0 : volume) * 100}%` }}
            />
          </div>

          <div className="player-title">
            <strong>{req.title}</strong>
            {req.subtitle && <span>{req.subtitle}</span>}
          </div>

          {next && (
            <button className="player-btn" onClick={goNext} title="Épisode suivant (N)"><SkipForward size={30} /></button>
          )}
          <div className="pop-wrap">
            <button className="player-btn" onClick={() => setPanel(panel === 'tracks' ? null : 'tracks')} title="Audio et sous-titres">
              <MessageSquareText size={30} />
            </button>
            <AnimatePresence>
              {panel === 'tracks' && (
                <motion.div className="pop pop-tracks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                  <div className="pop-col">
                    <h4>Audio</h4>
                    {(probe?.audios || []).length === 0 && <p className="muted">Piste par défaut</p>}
                    {(probe?.audios || []).map((a) => (
                      <button key={a.index} className={audioIdx === a.index ? 'is-on' : ''} onClick={() => pickAudio(a.index)}>
                        {langName(a.lang)} {a.title && <small>{a.title}</small>}
                        <small>{a.codec.toUpperCase()} {a.channels > 2 ? `${a.channels === 6 ? '5.1' : a.channels === 8 ? '7.1' : a.channels + 'ch'}` : ''}</small>
                      </button>
                    ))}
                  </div>
                  <div className="pop-col">
                    <h4>Sous-titres {subLoading && <Loader2 className="spin" size={14} />}</h4>
                    <button className={!sub ? 'is-on' : ''} onClick={() => { setSub(null); setPanel(null); }}>Désactivés</button>
                    {internalSubs.map((s) => (
                      <button
                        key={'i' + s.index}
                        className={sub?.kind === 'internal' && sub.index === s.index ? 'is-on' : ''}
                        onClick={() => { setSub({ kind: 'internal', index: s.index, label: langName(s.lang) }); setPanel(null); }}
                      >
                        {langName(s.lang)} {s.forced && <small>forcés</small>} {s.title && <small>{s.title}</small>}
                      </button>
                    ))}
                    {extSorted.map((s) => (
                      <button
                        key={'e' + s.id}
                        className={sub?.kind === 'external' && sub.url === s.url ? 'is-on' : ''}
                        onClick={() => { setSub({ kind: 'external', url: s.url, label: langName(s.lang) }); setPanel(null); }}
                      >
                        {langName(s.lang)} <small>{s.addon}</small>
                      </button>
                    ))}
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
                      <button
                        key={s}
                        className={speed === s ? 'is-on' : ''}
                        onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; }}
                      >
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
    </motion.div>
  );
}
