import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Gauge, Loader2, Maximize, MessageSquareText, Minimize, Minus, Pause, Play,
  RotateCcw, RotateCw, SkipForward, Sun, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { Ambilight } from './Ambilight';
import { XRay } from './XRay';
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
  default?: boolean;
}

interface Info {
  /** Plus aucune source à essayer : message d'erreur final */
  failed?: string;
  /** VO sous-titrée demandée pour ce titre */
  langMode?: 'vf' | 'vo';
  /** Sous-titres français tout seuls quand l'audio n'est pas en français */
  autoFrenchSubs?: boolean;
  extSubs?: { url: string; lang: string; addon: string }[];
  next?: { label: string } | null;
  status?: string;
  progress?: number;
  autoplayNext?: boolean;
  autoSkipIntro?: boolean;
  /** X-Ray : réponse de la fenêtre principale, et affichage à la pause */
  xray?: { nonce: number; op: 'scene' | 'person' | 'recap' | 'trivia'; data: any; error?: string };
  xrayOnPause?: boolean;
  /** Générique mémorisé pour la série */
  intro?: { start: number; end: number } | null;
}

interface Segment { kind: 'intro' | 'recap'; start: number; end: number }

const RECAP_RE = /recap|previously|r[ée]sum[ée]|pr[ée]c[ée]demment/i;
const INTRO_RE = /^(intro|opening|op|ouverture|g[ée]n[ée]rique( de d[ée]but)?|title( sequence)?|opening credits?)$|\bintro\b|\bopening\b/i;

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
  const [chapters, setChapters] = useState<{ title?: string; time: number }[]>([]);
  const skipped = useRef(new Set<string>());
  // Source illisible : avant le début de la lecture, NOCTA essaie tout seul une autre source
  const failRef = useRef<(why: 'error' | 'timeout') => void>(() => {});
  const reported = useRef(false);
  /** Choix automatique audio / sous-titres, une seule fois par vidéo */
  const langAuto = useRef({ done: false, at: Date.now() });
  const [notice, setNotice] = useState<string | null>(null);
  const learn = useRef<{ from: number; to: number; at: number } | null>(null);
  const learnTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addedSubs = useRef(new Map<string, true>());
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Ambilight : mode et format de l'image, suivis dès l'ouverture (avant même que la vidéo démarre)
  const [ambi, setAmbi] = useState<'off' | 'bars' | 'immersive'>('off');
  const [dims, setDims] = useState({ w: 16, h: 9 });
  useEffect(() => bridge().on('mpv:ambimode', setAmbi), []);

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
        setChapters([]);
        skipped.current.clear();
        reported.current = false;
        langAuto.current = { done: false, at: Date.now() };
        setNotice(null);
        learn.current = null;
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
          case 'chapter-list': setChapters(Array.isArray(value) ? value : []); break;
          case 'audio-delay': if (typeof value === 'number') setAudioDelay(value); break;
          case 'sub-delay': if (typeof value === 'number') setSubDelay(value); break;
          case 'eof-reached': setEof(!!value); break;
          case 'dwidth': if (typeof value === 'number' && value > 0) setDims((d) => ({ ...d, w: value })); break;
          case 'dheight': if (typeof value === 'number' && value > 0) setDims((d) => ({ ...d, h: value })); break;
          case 'playback-restart': setStarted(true); break;
          case 'end-file':
            if (value === 'error') failRef.current('error');
            break;
        }
      }),
    ];
    bridge().ready();
    return () => offs.forEach((o) => o());
  }, []);

  const chapterSegments = useMemo(() => {
    const out: Segment[] = [];
    chapters.forEach((c, i) => {
      const end = chapters[i + 1]?.time ?? duration;
      const title = (c.title || '').trim();
      if (!title || !end || end - c.time < 8 || end - c.time > 360) return;
      if (RECAP_RE.test(title)) out.push({ kind: 'recap', start: c.time, end });
      else if (INTRO_RE.test(title)) out.push({ kind: 'intro', start: c.time, end });
    });
    return out;
  }, [chapters, duration]);
  const chapterIntro = chapterSegments.some((x) => x.kind === 'intro');
  const segments = useMemo(() => {
    const out = [...chapterSegments];
    if (!chapterIntro && info.intro && info.intro.end > info.intro.start) out.push({ kind: 'intro', ...info.intro });
    return out;
  }, [chapterSegments, chapterIntro, info.intro]);
  const activeSeg = started ? segments.find((x) => time >= x.start - 1 && time < x.end - 3) : undefined;

  const skipSegment = (seg: Segment) => {
    skipped.current.add(`${seg.kind}-${seg.start}`);
    learn.current = null;
    cmd('seek', seg.end, 'absolute');
  };

  // Générique passé automatiquement si l'option est activée
  useEffect(() => {
    if (!activeSeg || activeSeg.kind !== 'intro' || !info.autoSkipIntro) return;
    if (skipped.current.has(`${activeSeg.kind}-${activeSeg.start}`)) return;
    skipSegment(activeSeg);
    setFlash({ n: Date.now(), icon: 'fwd' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeg, info.autoSkipIntro]);

  const pos = scrub ?? time;
  const remaining = duration ? duration - pos : Infinity;

  // ---------- Actions ----------
  const togglePlay = useCallback(() => {
    cmd('cycle', 'pause');
    setFlash({ n: Date.now(), icon: paused ? 'play' : 'pause' });
  }, [paused]);

  /**
   * Apprentissage du générique : quand tu sautes manuellement 25 s à 2 min 30 vers l'avant
   * dans les 12 premières minutes, NOCTA retient la plage pour les autres épisodes.
   */
  const noteForwardJump = (from: number, to: number) => {
    if (to <= from) return;
    const now = Date.now();
    const l = learn.current;
    learn.current = l && now - l.at < 5000 && Math.abs(from - l.to) < 6 ? { from: l.from, to, at: now } : { from, to, at: now };
    clearTimeout(learnTimer.current);
    const { from: a, to: b } = learn.current;
    if (a < 720 && b - a >= 25 && b - a <= 150 && !chapterIntro) {
      learnTimer.current = setTimeout(() => bridge().intro({ start: Math.max(0, a - 2), end: b }), 4000);
    }
  };

  const seekTo = (t: number) => {
    noteForwardJump(time, t);
    cmd('seek', Math.max(0, t), 'absolute');
  };
  const skip = (d: number) => {
    if (d > 0) noteForwardJump(time, time + d);
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
  // Ambilight : désactivé → bandes noires → immersif
  const AMBI_NEXT = { off: 'bars', bars: 'immersive', immersive: 'off' } as const;
  const AMBI_LABEL = { off: 'Ambilight désactivé', bars: 'Ambilight · dans les bandes noires', immersive: 'Ambilight · immersif' };
  const cycleAmbi = () => {
    const next = AMBI_NEXT[ambi];
    setAmbi(next);
    bridge().ambilight(next);
    say(AMBI_LABEL[next], 2500);
  };

  const say = (text: string, ms = 4000) => {
    setNotice(text);
    if (ms) setTimeout(() => setNotice((n) => (n === text ? null : n)), ms);
  };
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const initRef = useRef(init);
  initRef.current = init;

  /**
   * Sous-titres français d'un addon (OpenSubtitles…) : NOCTA vérifie qu'ils sont bien calés
   * sur la vidéo et les recale tout seul si besoin (décalage ou dérive).
   */
  const syncing = useRef(new Set<string>());
  const autoSync = async (s: { url: string; lang: string; addon: string }) => {
    if (!init?.src || !/^(fr|fre|fra)/i.test(s.lang) || syncing.current.has(s.url) || !bridge().subsync) return;
    syncing.current.add(s.url);
    const src = init.src;
    say('Vérification de la synchro des sous-titres…', 0);
    try {
      const r = await bridge().subsync({ src, url: s.url, duration });
      // Entre-temps, la vidéo ou les sous-titres choisis ont pu changer
      const cur = tracksRef.current.find((t) => t.type === 'sub' && t.selected);
      if (initRef.current?.src !== src || (cur && cur['external-filename'] !== s.url)) { setNotice(null); return; }
      if (r.status === 'synced' && r.file) {
        await cmd('sub-add', r.file, 'select', `${langName(s.lang)} · recalés par NOCTA`, s.lang);
        const off = r.offset ?? 0;
        const drift = Math.abs((r.scale ?? 1) - 1) > 0.001;
        say(`Sous-titres recalés (${off >= 0 ? '+' : ''}${off.toFixed(1).replace('.', ',')} s${drift ? ', vitesse corrigée' : ''})`);
      } else if (r.status === 'ok') {
        say('Sous-titres bien synchronisés ✓');
      } else {
        setNotice(null);
      }
    } catch {
      setNotice(null);
    }
  };

  const addExtSub = async (s: { url: string; lang: string; addon: string }) => {
    setPanel(null);
    const existing = tracks.find((t) => t.type === 'sub' && t['external-filename'] === s.url);
    if (existing) return selectSub(existing.id);
    if (addedSubs.current.has(s.url)) return;
    addedSubs.current.set(s.url, true);
    await cmd('sub-add', s.url, 'select', `${langName(s.lang)} · ${s.addon}`, s.lang);
    autoSync(s);
  };

  // ---------- Source illisible ou qui ne répond pas ----------
  failRef.current = (why) => {
    if (!started && !reported.current) {
      reported.current = true;
      bridge().action('failed', why);
      return;
    }
    if (started) setError('La lecture s\'est interrompue (connexion perdue ou lien expiré).');
  };
  useEffect(() => { if (info.failed) setError(info.failed); }, [info.failed]);
  // Chargement qui n'en finit pas : au bout de 45 s, on passe à une autre source
  useEffect(() => {
    if (!init || started || error) return;
    const t = setTimeout(() => failRef.current('timeout'), 45000);
    return () => clearTimeout(t);
  }, [init, started, error]);

  // ---------- Langue : VO choisie pour ce titre, sous-titres FR si l'audio n'est pas en français ----------
  useEffect(() => {
    const a = langAuto.current;
    // On attend le réglage de langue du titre (envoyé juste après l'ouverture)
    if (a.done || !started || !tracks.length || !info.langMode) return;
    const isFr = (t: { lang?: string; title?: string }) =>
      /^(fr|fre|fra|french)(-|$)/i.test(t.lang || '') || (!t.lang && /fran[cç]ais|french|\bvff?\b|vfq/i.test(t.title || ''));
    const audios = tracks.filter((t) => t.type === 'audio');
    const subTracks = tracks.filter((t) => t.type === 'sub');
    let audio = audios.find((t) => t.selected);

    // VO demandée : on quitte la VF pour la piste originale
    if (info.langMode === 'vo' && audio && isFr(audio)) {
      const vo = audios.find((t) => !isFr(t) && t.default) || audios.find((t) => !isFr(t));
      if (vo) { cmd('set_property', 'aid', vo.id); audio = vo; }
    }
    const audioIsFr = !!audio && isFr(audio);
    const audioKnown = !!audio && (!!audio.lang || audioIsFr);
    const wantSubs = info.autoFrenchSubs !== false && (info.langMode === 'vo' || (audioKnown && !audioIsFr));
    if (!wantSubs) { a.done = true; return; }

    const current = subTracks.find((t) => t.selected);
    if (current && isFr(current) && !current.forced) { a.done = true; return; }
    // Sous-titres français du fichier (complets, pas seulement « forcés »), sinon ceux des addons
    const internal = subTracks.find((t) => isFr(t) && !t.forced);
    if (internal) {
      a.done = true;
      cmd('set_property', 'sid', internal.id);
      say('Sous-titres français activés');
      return;
    }
    const ext = (info.extSubs || []).find((s) => /^(fr|fre|fra)/i.test(s.lang));
    if (ext) {
      a.done = true;
      addExtSub(ext);
      say('Sous-titres français activés');
      return;
    }
    // Les sous-titres des addons arrivent parfois quelques secondes après : on attend un peu
    if (Date.now() - a.at > 20000) a.done = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, tracks, info.extSubs, info.langMode, info.autoFrenchSubs]);

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
        case 'l': case 'L': cycleAmbi(); break;
        case 'n': case 'N': if (info.next) goNext(); break;
        case 's': case 'S': if (activeSeg) skipSegment(activeSeg); break;
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

  // ---------- Télécommande (téléphone) ----------
  const skipVisible = activeSeg && !skipped.current.has(`${activeSeg.kind}-${activeSeg.start}`) ? activeSeg.kind : null;
  useEffect(() => { bridge().remoteState?.({ skip: skipVisible }); }, [skipVisible]);
  useEffect(() => bridge().on('remote:key', (k: string) => {
    poke();
    switch (k) {
      case 'ok': case 'playpause': togglePlay(); break;
      case 'right': skip(10); break;
      case 'left': skip(-10); break;
      case 'up': setVol(volume + 5); break;
      case 'down': setVol(volume - 5); break;
      case 'skip': if (activeSeg) skipSegment(activeSeg); break;
      case 'next': if (info.next) goNext(); break;
      case 'back': case 'home': if (panel) setPanel(null); else close(); break;
    }
  }));

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
      <Ambilight visible={started && !error} mode={ambi} aspect={dims.w / dims.h} />
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
        {notice && (
          <motion.div
            key={notice}
            className="player-notice"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <MessageSquareText size={16} /> {notice}
          </motion.div>
        )}
      </AnimatePresence>

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
          <div className="player-error-actions">
            <button className="btn btn-white" onClick={() => { setError(null); bridge().action('retry', { at: time }); }}>Réessayer</button>
            <button className="btn btn-glass" onClick={() => bridge().action('pickOther')}>Choisir une autre source</button>
            <button className="btn-link" onClick={close}>Retour</button>
          </div>
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
            {activeSeg && !skipped.current.has(`${activeSeg.kind}-${activeSeg.start}`) && (
              <motion.button
                key={activeSeg.kind + activeSeg.start}
                className="skip-btn"
                onClick={() => skipSegment(activeSeg)}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.3 }}
              >
                <SkipForward size={18} /> {activeSeg.kind === 'intro' ? "Passer l'intro" : 'Passer le résumé'}
                <span className="skip-fill" style={{ animationDuration: `${Math.max(3, activeSeg.end - Math.max(time, activeSeg.start))}s` }} />
              </motion.button>
            )}
          </AnimatePresence>

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

              <button className="player-btn xr-btn" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))} title="X-Ray : qui est à l'écran (X)">
                X-Ray
              </button>

              <button className={`player-btn ${ambi !== 'off' ? 'is-lit' : ''}`} onClick={cycleAmbi} title={`${AMBI_LABEL[ambi]} (L pour changer)`}>
                <Sun size={28} />
              </button>

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
      {init && (
        <XRay
          time={time}
          paused={paused}
          controls={controls}
          reply={info.xray}
          onPause={() => cmd('set_property', 'pause', true)}
          onPlay={() => cmd('set_property', 'pause', false)}
          title={init.title}
          subtitle={init.subtitle}
          autoOnPause={info.xrayOnPause !== false}
          started={started && !error}
        />
      )}
    </div>
  );
}
