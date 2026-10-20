/// <reference types="vite/client" />

interface NoctaProbe {
  ok: boolean;
  error?: string;
  duration: number;
  format: string;
  video: { codec: string; profile: string; pixFmt: string; width: number; height: number; colorTransfer: string } | null;
  audios: { index: number; codec: string; channels: number; lang: string; title: string; isDefault: boolean }[];
  subs: { index: number; codec: string; lang: string; title: string; text: boolean; forced: boolean }[];
}

interface NoctaRemoteStatus {
  enabled: boolean;
  running: boolean;
  error: string | null;
  url: string | null;
  urls: string[];
  qr: string | null;
  tailscale: { url: string; qr: string } | null;
  clients: string[];
}

interface NoctaTrackLangs {
  ok: boolean;
  audios?: { lang: string; title: string; forced: boolean }[];
  subs?: { lang: string; title: string; forced: boolean }[];
}

interface NoctaUpdateState {
  state: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'installing' | 'error';
  current: string;
  version?: string | null;
  notes?: string | null;
  size?: number;
  progress?: number;
  portable?: boolean;
  error?: string | null;
  note?: string;
}

interface NoctaBridge {
  platform: string;
  store: { load: () => any; save: (data: any) => Promise<boolean> };
  http: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
    Promise<{ ok: boolean; status: number; data?: any; error?: string }>;
  media: {
    port: () => Promise<number>;
    probe: (src: string) => Promise<NoctaProbe>;
    langs: (src: string) => Promise<NoctaTrackLangs>;
    capabilities: () => Promise<{ ffmpeg: boolean; encoders: string[] }>;
    keyframe: (src: string, t: number) => Promise<number>;
  };
  player: {
    available: () => Promise<boolean>;
    open: (req: any) => Promise<{ ok: boolean; error?: string }>;
    load: (req: any) => Promise<void>;
    cmd: (...args: any[]) => Promise<any>;
    close: () => Promise<void>;
    info: (info: any) => Promise<void>;
    next: () => Promise<void>;
    ready: () => Promise<void>;
    intro: (mark: { start: number; end: number } | null) => Promise<void>;
    fullscreen: () => Promise<boolean>;
    minimize: () => Promise<void>;
    remoteState: (st: { skip: 'intro' | 'recap' | null }) => Promise<void>;
    subsync: (job: { src: string; url: string; duration: number }) =>
      Promise<{ status: 'ok' | 'synced' | 'unsure'; file?: string; offset?: number; scale?: number }>;
    on: (channel: string, cb: (data: any) => void) => () => void;
  };
  openVideoDialog: () => Promise<string | null>;
  pathForFile: (file: File) => string;
  openExternal: (url: string) => Promise<void>;
  openLogs: () => Promise<string>;
  quit: () => Promise<void>;
  intro: {
    detect: (job: { seriesId: string; a: { id: string; src?: string }; b?: { id: string; src?: string } }) =>
      Promise<Record<string, { start: number; end: number }>>;
    has: (seriesId: string, videoId: string) => Promise<boolean>;
  };
  addons: {
    openWindow: (url: string) => Promise<void>;
    onInstall: (cb: (manifestUrl: string) => void) => () => void;
  };
  update: {
    status: () => Promise<NoctaUpdateState>;
    check: () => Promise<NoctaUpdateState>;
    install: () => Promise<NoctaUpdateState>;
    on: (cb: (st: NoctaUpdateState) => void) => () => void;
  };
  remote: {
    status: () => Promise<NoctaRemoteStatus>;
    setEnabled: (v: boolean) => Promise<NoctaRemoteStatus>;
    reset: () => Promise<NoctaRemoteStatus>;
    on: (channel: 'key' | 'text' | 'status' | 'connected', cb: (data: any) => void) => () => void;
  };
  win: {
    toggleFullscreen: () => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    setFullscreen: (v: boolean) => Promise<boolean>;
    onFullscreen: (cb: (v: boolean) => void) => () => void;
  };
}

interface Window {
  nocta?: NoctaBridge;
}
