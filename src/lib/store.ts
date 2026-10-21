import { create } from 'zustand';
import { CINEMETA_FALLBACK, CINEMETA_URL, OPENSUBTITLES_URL } from './addons';
import type { Avatar, InstalledAddon, Meta, MetaPreview, PlayRequest, Profile, ProgressEntry, Settings, IntroMark, LangMode } from './types';

export type Page = 'home' | 'series' | 'movies' | 'mylist' | 'search' | 'addons' | 'settings' | 'browse' | 'catalogs' | 'galaxy';

/** Une catégorie complète à parcourir (« Tout voir ») */
export interface BrowseDef {
  key: string;
  title: string;
  load: (skip: number) => Promise<MetaPreview[]>;
  pageable: boolean;
  /** Si présent : tout le catalogue d'un coup, sans chargement infini */
  loadAll?: () => Promise<MetaPreview[]>;
  from: Page;
}

interface PersistedData {
  version: 1;
  profiles: Profile[];
  addons: InstalledAddon[];
  settings: Settings;
  /** Génériques appris par série (commun à tous les profils) */
  introMarks?: Record<string, IntroMark>;
}

export interface Toast { id: number; text: string; tone?: 'info' | 'error' | 'success' }

interface State extends PersistedData {
  activeProfileId: string | null;
  page: Page;
  searchQuery: string;
  detail: { type: string; id: string; preview?: MetaPreview } | null;
  /** autoLaunch : lancée par Nox, la 1re source confirmée dans la bonne langue démarre toute seule */
  picker: { meta: Meta | MetaPreview; type: string; videoId: string; season?: number; episode?: number; episodeTitle?: string; autoLaunch?: boolean } | null;
  player: PlayRequest | null;
  browse: BrowseDef | null;
  mpvAvailable: boolean;
  toasts: Toast[];

  // actions
  setPage: (p: Page) => void;
  setSearch: (q: string) => void;
  selectProfile: (id: string | null) => void;
  upsertProfile: (p: { id?: string; name: string; avatar: Avatar }) => string;
  deleteProfile: (id: string) => void;
  toggleMyList: (m: MetaPreview) => void;
  setLangPref: (metaId: string, mode: LangMode | null) => void;
  saveProgress: (key: string, entry: ProgressEntry) => void;
  setWatched: (videoIds: string[], watched: boolean) => void;
  setIntroMark: (seriesId: string, mark: IntroMark | null) => void;
  removeProgress: (key: string) => void;
  /** Vide « Reprendre » du profil actif */
  clearProgress: () => void;
  setAddons: (a: InstalledAddon[]) => void;
  updateSettings: (s: Partial<Settings>) => void;
  openDetail: (m: { type: string; id: string; preview?: MetaPreview }) => void;
  closeDetail: () => void;
  openPicker: (p: State['picker']) => void;
  closePicker: () => void;
  play: (r: PlayRequest) => void;
  closePlayer: () => void;
  openBrowse: (b: Omit<BrowseDef, 'from'>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

export const EMOJI_PRESETS: { emoji: string; bg: string }[] = [
  { emoji: '😎', bg: 'linear-gradient(135deg,#ff3d6e,#8a0b3a)' },
  { emoji: '👻', bg: 'linear-gradient(135deg,#7f5af0,#2b1a72)' },
  { emoji: '🐼', bg: 'linear-gradient(135deg,#2cb67d,#0b4d36)' },
  { emoji: '🦊', bg: 'linear-gradient(135deg,#ff8906,#a33b00)' },
  { emoji: '🐸', bg: 'linear-gradient(135deg,#9be15d,#00a35c)' },
  { emoji: '👽', bg: 'linear-gradient(135deg,#00d4ff,#0a3d91)' },
  { emoji: '🤖', bg: 'linear-gradient(135deg,#94a3b8,#334155)' },
  { emoji: '🦁', bg: 'linear-gradient(135deg,#fbbf24,#b45309)' },
  { emoji: '🐱', bg: 'linear-gradient(135deg,#f472b6,#9d174d)' },
  { emoji: '🐶', bg: 'linear-gradient(135deg,#fcd34d,#d97706)' },
  { emoji: '🦄', bg: 'linear-gradient(135deg,#f0abfc,#7e22ce)' },
  { emoji: '🐉', bg: 'linear-gradient(135deg,#34d399,#065f46)' },
  { emoji: '💀', bg: 'linear-gradient(135deg,#475569,#020617)' },
  { emoji: '🔥', bg: 'linear-gradient(135deg,#fb7185,#e11d48)' },
  { emoji: '⚡', bg: 'linear-gradient(135deg,#fde047,#ca8a04)' },
  { emoji: '🌙', bg: 'linear-gradient(135deg,#6366f1,#1e1b4b)' },
  { emoji: '🍿', bg: 'linear-gradient(135deg,#ef4444,#7f1d1d)' },
  { emoji: '🎮', bg: 'linear-gradient(135deg,#22d3ee,#155e75)' },
  { emoji: '🥷', bg: 'linear-gradient(135deg,#1f2937,#000000)' },
  { emoji: '🧛', bg: 'linear-gradient(135deg,#be123c,#2a0610)' },
  { emoji: '🧙', bg: 'linear-gradient(135deg,#8b5cf6,#3b0764)' },
  { emoji: '🦸', bg: 'linear-gradient(135deg,#3b82f6,#b91c1c)' },
  { emoji: '🐙', bg: 'linear-gradient(135deg,#fb923c,#9a3412)' },
  { emoji: '🦖', bg: 'linear-gradient(135deg,#84cc16,#3f6212)' },
  { emoji: '🤠', bg: 'linear-gradient(135deg,#d6a35c,#6b3f12)' },
  { emoji: '🥶', bg: 'linear-gradient(135deg,#7dd3fc,#0369a1)' },
  { emoji: '🤡', bg: 'linear-gradient(135deg,#f43f5e,#facc15)' },
  { emoji: '😈', bg: 'linear-gradient(135deg,#a855f7,#581c87)' },
  { emoji: '🐧', bg: 'linear-gradient(135deg,#e2e8f0,#1e293b)' },
  { emoji: '🍕', bg: 'linear-gradient(135deg,#fdba74,#c2410c)' },
  { emoji: '👑', bg: 'linear-gradient(135deg,#fde68a,#a16207)' },
  { emoji: '🎧', bg: 'linear-gradient(135deg,#14b8a6,#134e4a)' },
];

const DEFAULT_SETTINGS: Settings = {
  introSound: true,
  encoder: 'libx264',
  autoplayNext: true,
  volume: 1,
  subtitleSize: 100,
  preferredSubLang: 'fre',
  playerEngine: 'mpv',
  seasonalTheme: 'auto',
  autoplayTrailers: true,
  maxResolution: 1080,
  preferFrench: true,
  verifyLanguage: true,
  autoFrenchSubs: true,
  hideUhd: true,
  autoSkipIntro: false,
  introDetection: true,
};

const uid = () => Math.random().toString(36).slice(2, 10);

function initialData(): PersistedData {
  const loaded = window.nocta?.store.load() ?? (() => {
    try { return JSON.parse(localStorage.getItem('nocta-data') || 'null'); } catch { return null; }
  })();
  if (loaded && loaded.version === 1) {
    return { ...loaded, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } };
  }
  return {
    version: 1,
    profiles: [
      { id: uid(), name: 'Moi', avatar: { kind: 'emoji', ...EMOJI_PRESETS[0] }, myList: [], progress: {} },
    ],
    addons: [
      { url: CINEMETA_URL, manifest: CINEMETA_FALLBACK },
      {
        url: OPENSUBTITLES_URL,
        manifest: {
          id: 'org.stremio.opensubtitlesv3', name: 'OpenSubtitles v3', version: '1.0.0',
          description: 'Sous-titres pour films et séries.', types: ['movie', 'series'],
          resources: ['subtitles'], idPrefixes: ['tt'], catalogs: [],
        },
      },
    ],
    settings: DEFAULT_SETTINGS,
  };
}

const updateProfile = (s: State, fn: (p: Profile) => Profile) =>
  s.profiles.map((p) => (p.id === s.activeProfileId ? fn(p) : p));

export const useStore = create<State>((set, get) => ({
  ...initialData(),
  activeProfileId: null,
  page: 'home',
  searchQuery: '',
  detail: null,
  picker: null,
  player: null,
  browse: null,
  mpvAvailable: false,
  toasts: [],

  setPage: (page) => set({ page }),
  setSearch: (searchQuery) => set({ searchQuery, page: searchQuery ? 'search' : get().page === 'search' ? 'home' : get().page }),
  selectProfile: (activeProfileId) => set({ activeProfileId, page: 'home', detail: null, picker: null, searchQuery: '' }),

  upsertProfile: ({ id, name, avatar }) => {
    const pid = id || uid();
    set((s) => ({
      profiles: id
        ? s.profiles.map((p) => (p.id === id ? { ...p, name, avatar } : p))
        : [...s.profiles, { id: pid, name, avatar, myList: [], progress: {} }],
    }));
    return pid;
  },
  deleteProfile: (id) => set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) })),

  setLangPref: (metaId, mode) => set((s) => ({
    profiles: updateProfile(s, (p) => {
      const next = { ...(p.langPrefs || {}) };
      if (mode) next[metaId] = mode; else delete next[metaId];
      return { ...p, langPrefs: next };
    }),
  })),

  toggleMyList: (m) => set((s) => ({
    profiles: updateProfile(s, (p) => {
      const has = p.myList.some((x) => x.id === m.id);
      const slim: MetaPreview = { id: m.id, type: m.type, name: m.name, poster: m.poster, background: m.background, logo: m.logo, releaseInfo: m.releaseInfo, imdbRating: m.imdbRating, genres: m.genres, description: m.description };
      return { ...p, myList: has ? p.myList.filter((x) => x.id !== m.id) : [slim, ...p.myList] };
    }),
  })),

  saveProgress: (key, entry) => set((s) => ({
    profiles: updateProfile(s, (p) => ({ ...p, progress: { ...p.progress, [key]: entry } })),
  })),
  setWatched: (ids, watched) => set((s) => ({
    profiles: updateProfile(s, (p) => {
      const next = { ...(p.watched || {}) };
      for (const id of ids) {
        if (watched) next[id] = Date.now();
        else delete next[id];
      }
      return { ...p, watched: next };
    }),
  })),
  setIntroMark: (seriesId, mark) => set((s) => {
    const next = { ...(s.introMarks || {}) };
    if (mark) next[seriesId] = mark;
    else delete next[seriesId];
    return { introMarks: next };
  }),
  clearProgress: () => set((s) => ({ profiles: updateProfile(s, (p) => ({ ...p, progress: {} })) })),
  removeProgress: (key) => set((s) => ({
    profiles: updateProfile(s, (p) => {
      const { [key]: _drop, ...rest } = p.progress;
      return { ...p, progress: rest };
    }),
  })),

  setAddons: (addons) => set({ addons }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  openDetail: (detail) => set({ detail }),
  closeDetail: () => set({ detail: null }),
  openPicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
  play: (r) => set((s) => ({
    player: { ...r, engine: r.engine || (s.mpvAvailable && s.settings.playerEngine !== 'web' ? 'mpv' : 'web') },
    picker: null,
  })),
  closePlayer: () => set({ player: null }),
  openBrowse: (b) => set((s) => ({ browse: { ...b, from: s.page === 'browse' ? (s.browse?.from || 'home') : s.page }, page: 'browse' })),

  toast: (text, tone = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const useProfile = () =>
  useStore((s) => s.profiles.find((p) => p.id === s.activeProfileId) || null);

window.nocta?.player?.available().then((ok) => useStore.setState({ mpvAvailable: ok })).catch(() => {});

// Sauvegarde automatique (débouncée) des données persistantes
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.profiles === prev.profiles && s.addons === prev.addons && s.settings === prev.settings && s.introMarks === prev.introMarks) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data: PersistedData = { version: 1, profiles: s.profiles, addons: s.addons, settings: s.settings, introMarks: s.introMarks };
    if (window.nocta) window.nocta.store.save(data);
    else try { localStorage.setItem('nocta-data', JSON.stringify(data)); } catch {}
  }, 400);
});
