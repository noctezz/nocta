import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FolderOpen, Maximize2, Minimize2, Pencil, Power, Search, Settings, Smartphone, X } from 'lucide-react';
import { useProfile, useStore, type Page } from '../lib/store';
import { playLocalFile } from '../lib/playback';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { RemoteModal, useRemoteStatus } from './RemotePanel';

const LINKS: { page: Page; label: string }[] = [
  { page: 'home', label: 'Accueil' },
  { page: 'series', label: 'Séries' },
  { page: 'movies', label: 'Films' },
  { page: 'catalogs', label: 'Catalogues' },
  { page: 'mylist', label: 'Ma liste' },
  { page: 'addons', label: 'Addons' },
];

export function Navbar() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const query = useStore((s) => s.searchQuery);
  const setSearch = useStore((s) => s.setSearch);
  const profiles = useStore((s) => s.profiles);
  const selectProfile = useStore((s) => s.selectProfile);
  const profile = useProfile();
  const [solid, setSolid] = useState(false);
  const [searchOpen, setSearchOpen] = useState(!!query);
  const [menu, setMenu] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remote] = useRemoteStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Recherche lancée depuis la télécommande : le champ s'ouvre avec le texte tapé
  useEffect(() => { if (query) setSearchOpen(true); }, [query]);

  const openFile = async () => {
    const p = await window.nocta?.openVideoDialog();
    if (p) playLocalFile(p);
  };

  const isMac = window.nocta?.platform === 'darwin';
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    window.nocta?.win.isFullscreen().then(setFullscreen);
    return window.nocta?.win.onFullscreen(setFullscreen);
  }, []);

  return (
    <header className={`navbar drag ${solid ? 'is-solid' : ''} ${isMac ? 'is-mac' : ''} ${fullscreen ? 'is-fullscreen' : ''}`}>
      <button className="nav-logo no-drag" onClick={() => { setSearch(''); setPage('home'); window.scrollTo({ top: 0 }); }}>
        <Logo height={30} />
      </button>
      <nav className="nav-links no-drag">
        {LINKS.map((l) => (
          <button
            key={l.page}
            className={page === l.page ? 'is-active' : ''}
            onClick={() => { setSearch(''); setPage(l.page); window.scrollTo({ top: 0 }); }}
          >
            {l.label}
          </button>
        ))}
      </nav>

      <div className="nav-right no-drag">
        <div className={`nav-search ${searchOpen ? 'is-open' : ''}`}>
          <button onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} aria-label="Rechercher"><Search size={20} /></button>
          <input
            ref={inputRef}
            placeholder="Titres, personnes, genres"
            value={query}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => !query && setSearchOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && (setSearch(''), setSearchOpen(false))}
          />
          {query && <button onClick={() => { setSearch(''); inputRef.current?.focus(); }}><X size={16} /></button>}
        </div>

        {window.nocta && (
          <button
            className={`nav-icon ${remote?.clients.length ? 'has-remote' : ''}`}
            onClick={() => setRemoteOpen(true)}
            title={remote?.clients.length ? `Télécommande : ${remote.clients.join(', ')} connecté` : 'Télécommande (téléphone)'}
          >
            <Smartphone size={20} />
          </button>
        )}

        {window.nocta && (
          <button className="nav-icon" onClick={openFile} title="Ouvrir une vidéo de ton PC">
            <FolderOpen size={20} />
          </button>
        )}

        <div
          className="nav-profile"
          onMouseEnter={() => { clearTimeout(menuTimer.current); setMenu(true); }}
          onMouseLeave={() => { menuTimer.current = setTimeout(() => setMenu(false), 250); }}
        >
          {profile && <Avatar avatar={profile.avatar} size={32} />}
          <ChevronDown size={16} className={`caret ${menu ? 'is-up' : ''}`} />
          <AnimatePresence>
            {menu && (
              <motion.div
                className="nav-menu"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {profiles.filter((p) => p.id !== profile?.id).map((p) => (
                  <button key={p.id} onClick={() => { setMenu(false); selectProfile(p.id); }}>
                    <Avatar avatar={p.avatar} size={28} /> {p.name}
                  </button>
                ))}
                <button onClick={() => { setMenu(false); selectProfile(null); }}>
                  <Pencil size={18} /> Gérer les profils
                </button>
                <button onClick={() => { setMenu(false); setSearch(''); setPage('settings'); }}>
                  <Settings size={18} /> Paramètres
                </button>
                {window.nocta && (
                  <button onClick={() => { setMenu(false); window.nocta!.win.toggleFullscreen(); }}>
                    {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />} {fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                    <kbd>F11</kbd>
                  </button>
                )}
                {window.nocta && (
                  <>
                    <hr />
                    <button className="nav-quit" onClick={() => window.nocta!.quit()}>
                      <Power size={18} /> Quitter NOCTA
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <RemoteModal open={remoteOpen} onClose={() => setRemoteOpen(false)} />
    </header>
  );
}
