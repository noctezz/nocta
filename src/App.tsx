import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
// La Machine à remonter le temps (three.js, lourde) n'est chargée qu'à l'ouverture
const TimeMachine = lazy(() => import('./pages/TimeMachine').then((m) => ({ default: m.TimeMachine })));
import { speak, stopSpeaking } from './lib/speak';
import { AnimatePresence, motion } from 'framer-motion';
import { Intro } from './components/Intro';
import { ProfileGate } from './components/ProfileGate';
import { Navbar } from './components/Navbar';
import { HoverPreview } from './components/HoverPreview';
import { DetailModal } from './components/DetailModal';
import { StreamPicker } from './components/StreamPicker';
import { Player } from './components/Player';
import { MpvBridge } from './components/MpvBridge';
import { LoadingScreen } from './components/LoadingScreen';
import { SeasonalLayer } from './components/SeasonalLayer';
import { useSeasonTheme } from './lib/theme';
import { Home } from './pages/Home';
import { Browse } from './pages/Browse';
import { MyList } from './pages/MyList';
import { Search } from './pages/Search';
import { Addons } from './pages/Addons';
import { Settings } from './pages/Settings';
import { CatalogView } from './pages/CatalogView';
import { Catalogs } from './pages/Catalogs';
import { useStore } from './lib/store';
import { fetchManifest, installAddon } from './lib/addons';
import { errMsg } from './lib/playback';
import { playLocalFile } from './lib/playback';
import { useBusy, useHover } from './lib/ui';
import { UpdateBanner } from './components/UpdateBanner';
import { Nox } from './components/Nox';
import { installSpatialNav, navigate, type NavKey } from './lib/spatialNav';

const VIDEO_RE = /\.(mkv|mp4|avi|mov|webm|m4v|ts|wmv|flv)$/i;

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.tone}`}
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            layout
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function BusyOverlay() {
  const { busy, cancel, set } = useBusy();
  return (
    <AnimatePresence>
      {busy && (
        <LoadingScreen
          key="busy"
          info={busy}
          onBack={() => { if (cancel) cancel.cancelled = true; set(null, null); }}
        />
      )}
    </AnimatePresence>
  );
}

export default function App() {
  const [intro, setIntro] = useState(true);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const page = useStore((s) => s.page);
  const detail = useStore((s) => s.detail);
  const picker = useStore((s) => s.picker);
  const player = useStore((s) => s.player);
  const endIntro = useCallback(() => setIntro(false), []);
  const season = useSeasonTheme();

  // Thème saisonnier appliqué à toute l'interface (couleurs, décors CSS)
  useEffect(() => { document.documentElement.dataset.season = season; }, [season]);

  // Rafraîchit les manifests des addons au démarrage
  useEffect(() => {
    const { addons, setAddons } = useStore.getState();
    Promise.all(addons.map((a) => fetchManifest(a.url).then((manifest) => ({ ...a, manifest })).catch(() => a)))
      .then((fresh) => {
        const current = useStore.getState().addons;
        setAddons(current.map((a) => fresh.find((f) => f.url === a.url) || a));
      });
  }, []);

  // Bouton « Install » cliqué dans une page de configuration d'addon
  useEffect(() => window.nocta?.addons.onInstall((url) => {
    const { toast } = useStore.getState();
    installAddon(url)
      .then(({ manifest, updated }) => toast(`${manifest.name} ${updated ? 'mis à jour' : 'installé'} ✓`, 'success'))
      .catch((e) => toast(`Installation impossible : ${errMsg(e)}`, 'error'));
  }), []);

  // Navigation façon TV (flèches) + télécommande du téléphone
  useEffect(() => installSpatialNav(), []);
  useEffect(() => {
    const r = window.nocta?.remote;
    if (!r) return;
    const offs = [
      r.on('key', (k: NavKey) => navigate(k)),
      r.on('text', (q: string) => { useStore.getState().setSearch(q); window.scrollTo({ top: 0 }); }),
      r.on('connected', (device: string) => useStore.getState().toast(`📱 ${device} connecté : la télécommande est prête`, 'success')),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  // Glisser-déposer une vidéo n'importe où = lecture immédiate
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (!f || !VIDEO_RE.test(f.name) || !window.nocta) return;
      const p = window.nocta.pathForFile(f);
      if (p) playLocalFile(p);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  // Le lecteur a démarré : l'écran de chargement de la fenêtre principale disparaît
  useEffect(() => { if (player) useBusy.getState().set(null, null); }, [player]);
  // Le film démarre : Nox se tait… et te souhaite un bon visionnage
  const wasPlaying = useRef(false);
  useEffect(() => {
    const playing = !!player;
    if (playing && !wasPlaying.current) {
      stopSpeaking();
      const st = useStore.getState();
      if (st.settings.noxGreet !== false && (st.settings.noxVoice || 'mic') !== 'off' && st.settings.noxVisible !== false) {
        const name = st.profiles.find((p) => p.id === st.activeProfileId)?.name;
        const lines = [`Bon visionnage${name ? ` ${name}` : ''} !`, 'Bon film !', 'Installe-toi bien, ça commence !'];
        setTimeout(() => speak(player!.type === 'series' ? (Math.random() < 0.5 ? 'Bon épisode !' : lines[0]) : lines[Math.floor(Math.random() * lines.length)]), 300);
      }
    }
    wasPlaying.current = playing;
  }, [player]);

  // Pas de défilement de la page derrière les fenêtres
  useEffect(() => {
    document.body.style.overflow = detail || picker || player || !activeProfileId ? 'hidden' : '';
    if (detail || picker || player) useHover.getState().hide();
  }, [detail, picker, player, activeProfileId]);

  return (
    <>
      <AnimatePresence mode="wait">
        {intro ? (
          <Intro key="intro" onDone={endIntro} />
        ) : !activeProfileId ? (
          <ProfileGate key="gate" />
        ) : (
          <motion.div key={`app-${activeProfileId}`} className="app" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
            <Navbar />
            <main>
              {page === 'home' && <Home />}
              {page === 'series' && <Browse key="series" type="series" />}
              {page === 'movies' && <Browse key="movies" type="movie" />}
              {page === 'mylist' && <MyList />}
              {page === 'search' && <Search />}
              {page === 'addons' && <Addons />}
              {page === 'settings' && <Settings />}
              {page === 'browse' && <CatalogView />}
              {page === 'catalogs' && <Catalogs />}
              {page === 'timemachine' && <Suspense fallback={null}><TimeMachine /></Suspense>}
            </main>
            <HoverPreview />
            {!player && <Nox />}
            {!player && <SeasonalLayer theme={season} density={0.7} className="app-season" />}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{detail && <DetailModal key={detail.id} />}</AnimatePresence>
      <AnimatePresence>{picker && <StreamPicker key={picker.videoId} />}</AnimatePresence>
      <AnimatePresence>
        {player && (player.engine === 'mpv'
          ? <MpvBridge key="mpv" />
          : <Player key={player.src + (player.videoId || '')} />)}
      </AnimatePresence>
      <BusyOverlay />
      {!player && <UpdateBanner />}
      <Toasts />
    </>
  );
}
