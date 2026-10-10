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

interface NoctaBridge {
  platform: string;
  store: { load: () => any; save: (data: any) => Promise<boolean> };
  http: (url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) =>
    Promise<{ ok: boolean; status: number; data?: any; error?: string }>;
  media: {
    port: () => Promise<number>;
    probe: (src: string) => Promise<NoctaProbe>;
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
    on: (channel: string, cb: (data: any) => void) => () => void;
  };
  openVideoDialog: () => Promise<string | null>;
  pathForFile: (file: File) => string;
  openExternal: (url: string) => Promise<void>;
  openLogs: () => Promise<string>;
  quit: () => Promise<void>;
  addons: {
    openWindow: (url: string) => Promise<void>;
    onInstall: (cb: (manifestUrl: string) => void) => () => void;
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
