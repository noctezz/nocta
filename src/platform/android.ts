// NOCTA sur Android TV : le pont « window.nocta » (fourni par Electron sur PC) est recréé ici,
// avec le lecteur vidéo natif (Media3) et les requêtes réseau natives (sans blocage CORS).
// L'interface reste la même : le lecteur imite les commandes et événements de mpv.
import { Capacitor, CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

interface NativePlayer {
  open(o: { src: string; startAt?: number; volume?: number; alang?: string }): Promise<{ ok: boolean; error?: string }>;
  close(): Promise<{ time?: number; duration?: number }>;
  cmd(o: { args: unknown[] }): Promise<void>;
  probe(o: { src: string }): Promise<NoctaTrackLangs>;
  localIp(): Promise<{ ip: string }>;
  receiveStart(o: { code: string }): Promise<{ ok: boolean; name?: string; error?: string }>;
  receiveStop(): Promise<void>;
  addListener(event: 'mpv', cb: (d: { name: string; value: unknown }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'transfer', cb: (d: { data?: string; error?: string }) => void): Promise<PluginListenerHandle>;
}

export const isAndroid = () => Capacitor.getPlatform() === 'android';

function install() {
  const Native = registerPlugin<NativePlayer>('NoctaPlayer');

  // Petit bus d'événements : remplace les échanges entre fenêtres d'Electron
  const listeners = new Map<string, Set<(d: any) => void>>();
  const emit = (ch: string, d?: unknown) => listeners.get(ch)?.forEach((cb) => { try { cb(d); } catch (e) { console.error(e); } });
  const on = (ch: string, cb: (d: any) => void) => {
    if (!listeners.has(ch)) listeners.set(ch, new Set());
    listeners.get(ch)!.add(cb);
    return () => { listeners.get(ch)?.delete(cb); };
  };

  /** Lecture en cours (équivalent de la session mpv du PC) */
  let session: {
    req: any; info: Record<string, unknown>; props: Record<string, unknown>; started: boolean;
    last: { time: number; duration: number }; lastReport: number;
  } | null = null;

  Native.addListener('mpv', ({ name, value }) => {
    if (!session) return;
    session.props[name] = value;
    if (name === 'time-pos' && typeof value === 'number') session.last.time = value;
    if (name === 'duration' && typeof value === 'number' && value > 0) session.last.duration = value;
    if (name === 'playback-restart') session.started = true;
    if (name === 'start-file') session.started = false;
    if (name === 'player-error') console.warn('[lecteur]', value);
    emit('mpv:event', { name, value });
    // Progression pour la fenêtre principale (« Reprendre », vu / pas vu), toutes les 2 s
    if ((name === 'time-pos' || name === 'duration') && Date.now() - session.lastReport > 2000) {
      session.lastReport = Date.now();
      emit('player:state', { ...session.last });
    }
  });

  /** Requête par le moteur web : bien plus légère pour la box (pas de copie par le pont natif) */
  const webFailed = new Set<string>();
  const viaWeb = async (url: string, timeout: number) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
      const text = await r.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* texte */ }
      return { ok: r.ok, status: r.status, data: body };
    } finally {
      clearTimeout(t);
    }
  };

  const viaNative: NoctaBridge['http'] = async (url, opts = {}) => {
    try {
      const headers: Record<string, string> = { 'User-Agent': 'NOCTA', ...(opts.headers || {}) };
      let data: unknown = opts.body;
      // Corps JSON : envoyé tel quel (objet) pour que le plugin ne le réencode pas
      if (typeof data === 'string' && /json/i.test(headers['Content-Type'] || headers['content-type'] || '')) {
        try { data = JSON.parse(data); } catch { /* texte brut */ }
      }
      const r = await CapacitorHttp.request({
        url,
        method: opts.method || 'GET',
        headers,
        data,
        responseType: 'text',
        connectTimeout: opts.timeout || 20000,
        readTimeout: opts.timeout || 20000,
      });
      let body: unknown = r.data;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* texte */ } }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, data: body };
    } catch (e) {
      return { ok: false, status: 0, error: String((e as Error)?.message || e) };
    }
  };

  // Lectures simples (catalogues, fiches, sources) par le moteur web quand le serveur l'autorise ;
  // sinon (serveur fermé aux pages web, en-têtes, envoi de données) par le réseau natif
  const http: NoctaBridge['http'] = async (url, opts = {}) => {
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    const simple = (!opts.method || opts.method === 'GET') && !opts.body && !Object.keys(opts.headers || {}).length;
    if (simple && host && !webFailed.has(host) && /^https?:/i.test(url)) {
      try {
        return await viaWeb(url, opts.timeout || 20000);
      } catch (e) {
        // Délai dépassé : le serveur est lent, inutile de réessayer autrement
        if ((e as Error)?.name === 'AbortError') return { ok: false, status: 0, error: 'timeout' };
        webFailed.add(host);
      }
    }
    return viaNative(url, opts);
  };

  const STORE = 'nocta-data';
  const noop = async () => {};

  const bridge: NoctaBridge = {
    platform: 'android',
    store: {
      load: () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; } },
      save: async (data) => { try { localStorage.setItem(STORE, JSON.stringify(data)); return true; } catch { return false; } },
    },
    http,
    media: {
      port: async () => 0,
      probe: async () => ({ ok: false, error: 'indisponible', duration: 0, format: '', video: null, audios: [], subs: [] }),
      // Vraie VF : le lecteur natif ouvre le début du fichier et lit ses pistes
      langs: (src) => Native.probe({ src }).catch(() => ({ ok: false })),
      capabilities: async () => ({ ffmpeg: false, encoders: [] }),
      keyframe: async (_src, t) => t,
    },
    player: {
      available: async () => true,
      open: async (req) => {
        session = { req, info: {}, props: {}, started: false, last: { time: 0, duration: 0 }, lastReport: 0 };
        document.documentElement.classList.add('native-playing');
        // L'interface du lecteur est déjà affichée (même fenêtre) : on lui annonce la lecture
        emit('player:init', req);
        const r = await Native.open({ src: req.src, startAt: req.startAt, volume: req.volume, alang: req.alang });
        if (!r.ok) { session = null; document.documentElement.classList.remove('native-playing'); }
        return r;
      },
      load: async (req) => {
        if (!session) return;
        session = { ...session, req: { ...session.req, ...req }, info: {}, props: {}, started: false, last: { time: 0, duration: 0 } };
        emit('player:init', session.req);
        await Native.open({ src: req.src, startAt: req.startAt, volume: req.volume, alang: req.alang });
      },
      cmd: (...args) => Native.cmd({ args }),
      close: async () => {
        if (!session) return;
        const s = session;
        session = null;
        const r = await Native.close().catch(() => ({} as { time?: number; duration?: number }));
        document.documentElement.classList.remove('native-playing');
        emit('player:closed', { time: r.time ?? s.last.time, duration: r.duration || s.last.duration });
      },
      info: async (info) => {
        if (session) session.info = { ...session.info, ...info };
        emit('player:info', info);
      },
      next: async () => emit('player:next'),
      // L'interface du lecteur est prête : on lui envoie la lecture en cours et tout ce qui est déjà connu
      ready: async () => {
        if (!session) return;
        emit('player:init', session.req);
        emit('player:info', session.info);
        emit('mpv:ambimode', 'off');
        for (const [name, value] of Object.entries(session.props)) emit('mpv:event', { name, value });
        if (session.started) emit('mpv:event', { name: 'playback-restart', value: null });
      },
      intro: async (mark) => emit('player:intro', mark),
      fullscreen: async () => true,
      minimize: noop,
      remoteState: noop,
      action: async (name, data) => emit(`player:${name}`, data),
      ambilight: noop,
      subsync: async () => ({ status: 'unsure' as const }),
      on,
    },
    tv: {
      localIp: () => Native.localIp().then((r) => r.ip).catch(() => ''),
      // « Importer depuis mon PC » : la TV attend les données que le PC lui envoie
      receive: async (code, onData) => {
        const sub = await Native.addListener('transfer', onData);
        const r = await Native.receiveStart({ code }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
        const stop = () => { sub.remove(); Native.receiveStop().catch(() => {}); };
        if (!r.ok) stop();
        return { ...r, stop };
      },
    },
    openVideoDialog: async () => null,
    pathForFile: () => '',
    openExternal: async (url) => { window.open(url, '_blank'); },
    openLogs: async () => '',
    quit: async () => { await CapApp.exitApp(); },
    intro: undefined as unknown as NoctaBridge['intro'],
    // Pages « Configurer » des addons : ouvertes dans le navigateur de la TV
    addons: {
      openWindow: async (url) => { window.open(url, '_blank'); },
      onInstall: () => () => {},
    },
    assistant: {
      create: async () => ({ ok: false, error: 'L\'IA de l\'X-Ray n\'est pas encore disponible sur la TV' }),
      testKey: async () => ({ ok: false, error: 'Indisponible sur la TV' }),
    },
    update: undefined as unknown as NoctaBridge['update'],
    remote: undefined as unknown as NoctaBridge['remote'],
    win: {
      toggleFullscreen: async () => true,
      isFullscreen: async () => true,
      setFullscreen: async () => true,
      onFullscreen: () => () => {},
    },
  };
  (window as Window).nocta = bridge;
  document.documentElement.classList.add('is-tv');

  // Touche Retour de la télécommande : fermer ce qui est ouvert, revenir en arrière, ou réduire l'appli
  CapApp.addListener('backButton', async () => {
    const [{ useStore }, { navigate }] = await Promise.all([import('../lib/store'), import('../lib/spatialNav')]);
    const st = useStore.getState();
    const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Lecteur, fenêtres par-dessus la fiche (journal, choix d'un film) : comme Échap
    if (st.player || document.querySelector('.log-back, .sg-fix-back')) return escape();
    if (st.detail || st.picker) return navigate('back');
    // Page d'une saga ou d'une plateforme : retour à la liste
    if (document.querySelector('.sg-view, .pf-page')) return escape();
    if (st.searchQuery || st.page !== 'home') return navigate('back');
    CapApp.minimizeApp();
  });
}

if (isAndroid()) install();
