import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Intro } from './components/Intro';
import { ProfileGate } from './components/ProfileGate';
import { Navbar } from './components/Navbar';
import { HoverPreview } from './components/HoverPreview';
import { DetailModal } from './components/DetailModal';
import { StreamPicker } from './components/StreamPicker';
import { Player } from './components/Player';
import { Home } from './pages/Home';
import { Browse } from './pages/Browse';
import { MyList } from './pages/MyList';
import { Search } from './pages/Search';
import { Addons } from './pages/Addons';
import { Settings } from './pages/Settings';
import { TorboxLibrary } from './pages/TorboxLibrary';
import { useStore } from './lib/store';
import { fetchManifest } from './lib/addons';
import { playLocalFile } from './lib/playback';
import { useBusy, useHover } from './lib/ui';

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
        <motion.div className="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Loader2 className="spin" size={44} />
          <h3>{busy.label}</h3>
          {busy.sub && <p>{busy.sub}</p>}
          {busy.progress != null && <div className="bar"><div style={{ width: `${busy.progress}%` }} /></div>}
          <button className="btn-outline" onClick={() => { if (cancel) cancel.cancelled = true; set(null, null); }}>Annuler</button>
        </motion.div>
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

  // Rafraîchit les manifests des addons au démarrage
  useEffect(() => {
    const { addons, setAddons } = useStore.getState();
    Promise.all(addons.map((a) => fetchManifest(a.url).then((manifest) => ({ ...a, manifest })).catch(() => a)))
      .then((fresh) => {
        const current = useStore.getState().addons;
        setAddons(current.map((a) => fresh.find((f) => f.url === a.url) || a));
      });
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
              {page === 'torbox' && <TorboxLibrary />}
              {page === 'addons' && <Addons />}
              {page === 'settings' && <Settings />}
            </main>
            <HoverPreview />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{detail && <DetailModal key={detail.id} />}</AnimatePresence>
      <AnimatePresence>{picker && <StreamPicker key={picker.videoId} />}</AnimatePresence>
      <AnimatePresence>{player && <Player key={player.src + (player.videoId || '')} />}</AnimatePresence>
      <BusyOverlay />
      <Toasts />
    </>
  );
}
