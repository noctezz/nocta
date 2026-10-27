import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, Search as SearchIcon } from 'lucide-react';
import { useProfile, useStore } from '../lib/store';
import { fetchManifest } from '../lib/addons';
import { useBusy } from '../lib/ui';
import { Avatar } from '../components/Avatar';
import { LoadingScreen } from '../components/LoadingScreen';
import { StreamPicker } from '../components/StreamPicker';
import { MpvBridge } from '../components/MpvBridge';
import { Player } from '../components/Player';
import { useUpdateState } from '../components/UpdateBanner';
import { Section } from './Section';
import { Detail, type DetailRef } from './Detail';
import { Search } from './Search';
import type { Kind } from './data';

const TAB_KEY = 'nocta-mini-tab';

export function MiniApp() {
  const activeProfileId = useStore((s) => s.activeProfileId);
  const picker = useStore((s) => s.picker);
  const player = useStore((s) => s.player);
  const storeDetail = useStore((s) => s.detail);
  const [tab, setTabState] = useState<Kind>(() => {
    try { return localStorage.getItem(TAB_KEY) === 'series' ? 'series' : 'movie'; } catch { return 'movie'; }
  });
  const [detail, setDetail] = useState<DetailRef | null>(null);
  const [search, setSearch] = useState(false);

  const setTab = (t: Kind) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
    try { localStorage.setItem(TAB_KEY, t); } catch { /* pas de stockage */ }
  };

  // Les fonctions de lecture partagées avec NOCTA ouvrent parfois « la fiche » : c'est celle de Mini
  useEffect(() => {
    if (!storeDetail) return;
    setDetail(storeDetail);
    useStore.getState().closeDetail();
  }, [storeDetail]);

  // Manifests des addons rafraîchis au démarrage (comme dans NOCTA)
  useEffect(() => {
    const { addons, setAddons } = useStore.getState();
    Promise.all(addons.map((a) => fetchManifest(a.url).then((manifest) => ({ ...a, manifest })).catch(() => a)))
      .then((fresh) => {
        const current = useStore.getState().addons;
        setAddons(current.map((a) => fresh.find((f) => f.url === a.url) || a));
      });
  }, []);

  // Le lecteur a démarré : l'écran de chargement disparaît
  useEffect(() => { if (player) useBusy.getState().set(null, null); }, [player]);

  // Pas de défilement de la page derrière une fiche ou la recherche
  useEffect(() => {
    document.body.style.overflow = detail || search || player || !activeProfileId ? 'hidden' : '';
  }, [detail, search, player, activeProfileId]);

  return (
    <div className="mini">
      {!activeProfileId ? (
        <Gate />
      ) : (
        <>
          <TopBar tab={tab} onTab={setTab} onSearch={() => setSearch(true)} />
          <main>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <Section type={tab} onOpen={setDetail} />
              </motion.div>
            </AnimatePresence>
            <footer className="mn-foot">nocta <em>mini</em></footer>
          </main>
          <AnimatePresence>
            {search && <Search key="search" onClose={() => setSearch(false)} onOpen={(d) => { setDetail(d); }} />}
          </AnimatePresence>
          <AnimatePresence>
            {detail && <Detail key={`${detail.type}:${detail.id}`} target={detail} onClose={() => setDetail(null)} />}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>{picker && <StreamPicker key={picker.videoId} />}</AnimatePresence>
      <AnimatePresence>
        {player && (player.engine === 'mpv'
          ? <MpvBridge key="mpv" />
          : <Player key={player.src + (player.videoId || '')} />)}
      </AnimatePresence>
      <Busy />
      {!player && <UpdatePill />}
      <Toasts />
    </div>
  );
}

// ---------------------------------------------------------------- Barre du haut

function TopBar({ tab, onTab, onSearch }: { tab: Kind; onTab: (t: Kind) => void; onSearch: () => void }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`mn-top ${solid ? 'is-solid' : ''}`}>
      <button className="mn-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>nocta</button>
      <nav className="mn-tabs">
        {(['movie', 'series'] as const).map((t) => (
          <button key={t} className={tab === t ? 'is-on' : ''} onClick={() => onTab(t)}>
            {t === 'movie' ? 'Films' : 'Séries'}
            {tab === t && <motion.span layoutId="mn-tab-line" className="mn-tab-line" />}
          </button>
        ))}
      </nav>
      <div className="mn-right">
        <button className="mn-icon" onClick={onSearch} aria-label="Rechercher"><SearchIcon size={19} strokeWidth={1.6} /></button>
        <ProfileMenu />
      </div>
    </header>
  );
}

function ProfileMenu() {
  const profile = useProfile();
  const profiles = useStore((s) => s.profiles);
  const selectProfile = useStore((s) => s.selectProfile);
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  return (
    <div className="mn-profile" onMouseLeave={() => setOpen(false)}>
      <button className="mn-avatar" onClick={() => setOpen((o) => !o)} aria-label="Profil">
        <Avatar avatar={profile.avatar} size={30} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="mn-menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            <span className="mn-menu-name">{profile.name}</span>
            {profiles.filter((p) => p.id !== profile.id).map((p) => (
              <button key={p.id} onClick={() => { setOpen(false); selectProfile(p.id); }}>
                <Avatar avatar={p.avatar} size={22} /> {p.name}
              </button>
            ))}
            <button onClick={() => { setOpen(false); selectProfile(null); }}>Changer de profil</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- Choix du profil

function Gate() {
  const profiles = useStore((s) => s.profiles);
  const selectProfile = useStore((s) => s.selectProfile);
  return (
    <motion.div className="mn-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <span className="mn-gate-brand">nocta <em>mini</em></span>
      <h1>Qui regarde ?</h1>
      <div className="mn-gate-list">
        {profiles.map((p, i) => (
          <motion.button
            key={p.id}
            className="mn-gate-item"
            onClick={() => selectProfile(p.id)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
          >
            <Avatar avatar={p.avatar} size={96} />
            <span>{p.name}</span>
          </motion.button>
        ))}
      </div>
      <p className="mn-gate-note">Les profils, la progression et les addons sont ceux de NOCTA.</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------- Chargement, messages, mise à jour

function Busy() {
  const { busy, cancel, set } = useBusy();
  return (
    <AnimatePresence>
      {busy && <LoadingScreen key="busy" info={busy} onBack={() => { if (cancel) cancel.cancelled = true; set(null, null); }} />}
    </AnimatePresence>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="mn-toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`mn-toast is-${t.tone || 'info'}`}
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            layout
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function UpdatePill() {
  const [st] = useUpdateState();
  const [later, setLater] = useState<string | null>(null);
  if (!st) return null;
  const busy = st.state === 'downloading' || st.state === 'installing';
  if (!busy && !(st.state === 'available' && later !== st.version)) return null;
  return (
    <div className="mn-update">
      {busy ? (
        <span>{st.state === 'installing' ? 'Installation… NOCTA Mini va redémarrer' : `Téléchargement de la mise à jour${st.progress ? ` · ${st.progress} %` : '…'}`}</span>
      ) : (
        <>
          <span>Nouvelle version <strong>{st.version}</strong></span>
          <button onClick={() => window.nocta?.update.install()}><ArrowDown size={14} /> Installer</button>
          <button className="mn-update-later" onClick={() => setLater(st.version || null)}>Plus tard</button>
        </>
      )}
    </div>
  );
}
