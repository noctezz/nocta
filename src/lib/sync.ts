// Synchronisation des profils entre appareils (PC, TV…) : progression, épisodes vus, Ma liste,
// langues choisies et journal. Les profils sont rangés dans un gist secret du compte GitHub de
// l'utilisateur ; chaque appareil fusionne sa version avec celle du gist (fusion à trois voies
// avec la dernière version synchronisée : ajouts, modifications et suppressions des deux côtés).
import { create } from 'zustand';
import { useStore } from './store';
import type { Profile } from './types';
import { merge, same } from './merge3';

const API = 'https://api.github.com';
const FILE = 'nocta-sync.json';
const DESCRIPTION = 'NOCTA : synchronisation des profils (ne pas supprimer)';
const BASE_KEY = 'nocta-sync-base';

/** Page GitHub qui crée le jeton, déjà réglée (droit « gist » seulement) */
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=NOCTA%20Sync';

export const useSync = create<{ state: 'off' | 'syncing' | 'ok' | 'error'; at?: number; error?: string; account?: string }>(() => ({ state: 'off' }));

// ---------- GitHub ----------
class SyncError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

async function gh(path: string, method = 'GET', body?: unknown): Promise<any> {
  const token = (useStore.getState().settings.syncToken || '').trim();
  const r = await window.nocta!.http(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NOCTA',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    timeout: 30000,
  });
  if (r.status === 401) throw new SyncError('Jeton GitHub refusé ou expiré : recrée-le et colle-le de nouveau.', 401);
  if (!r.ok) throw new SyncError(r.status ? `GitHub a répondu ${r.status}` : 'Pas de connexion à internet pour le moment', r.status);
  return r.data;
}

/** Gist de synchronisation : celui déjà connu, celui créé par un autre appareil, ou un nouveau */
async function gistId(): Promise<string> {
  const st = useStore.getState();
  if (st.settings.syncGistId) return st.settings.syncGistId;
  const list: any[] = await gh('/gists?per_page=100');
  const found = Array.isArray(list) ? list.find((g) => g.files?.[FILE]) : null;
  const id: string = found?.id || (await gh('/gists', 'POST', {
    description: DESCRIPTION,
    public: false,
    files: { [FILE]: { content: JSON.stringify({ version: 1, profiles: [] }) } },
  })).id;
  useStore.getState().updateSettings({ syncGistId: id });
  return id;
}

async function readRemote(id: string): Promise<{ profiles: Profile[]; version?: string }> {
  const g = await gh(`/gists/${id}`);
  const f = g.files?.[FILE];
  if (!f) return { profiles: [], version: g.history?.[0]?.version };
  let data: any = f.content;
  // Gros fichier : GitHub n'en donne que le début, la suite est à son adresse brute
  if (f.truncated && f.raw_url) data = (await window.nocta!.http(f.raw_url, { timeout: 30000 })).data;
  if (typeof data === 'string') data = JSON.parse(data);
  return { profiles: Array.isArray(data?.profiles) ? data.profiles : [], version: g.history?.[0]?.version };
}

// ---------- Dernière version synchronisée (sur cet appareil) ----------
function loadBase(id: string): Profile[] | undefined {
  try {
    const b = JSON.parse(localStorage.getItem(BASE_KEY) || 'null');
    return b && b.gist === id ? b.profiles : undefined;
  } catch { return undefined; }
}
function saveBase(id: string, profiles: Profile[]) {
  try { localStorage.setItem(BASE_KEY, JSON.stringify({ gist: id, profiles })); } catch { /* pas de stockage */ }
}

// ---------- Synchronisation ----------
let applying = false;

async function once() {
  if (!window.nocta || !(useStore.getState().settings.syncToken || '').trim()) { useSync.setState({ state: 'off', error: undefined }); return; }
  useSync.setState({ state: 'syncing' });
  try {
    let id = await gistId();
    for (let attempt = 0; attempt < 3; attempt++) {
      let remote;
      try {
        remote = await readRemote(id);
      } catch (e) {
        // Gist supprimé à la main : on en recrée un
        if ((e as SyncError).status !== 404) throw e;
        useStore.getState().updateSettings({ syncGistId: undefined });
        id = await gistId();
        remote = await readRemote(id);
      }
      const local = useStore.getState().profiles;
      const merged: Profile[] = merge(loadBase(id), local, remote.profiles);
      if (!same(merged, local)) {
        applying = true;
        const st = useStore.getState();
        useStore.setState({
          profiles: merged,
          activeProfileId: merged.some((p) => p.id === st.activeProfileId) ? st.activeProfileId : null,
        });
        applying = false;
      }
      if (!same(merged, remote.profiles)) {
        // Un autre appareil a écrit pendant la fusion : on recommence avec sa version
        const last: any[] = await gh(`/gists/${id}/commits?per_page=1`);
        if (remote.version && last?.[0]?.version && last[0].version !== remote.version) continue;
        await gh(`/gists/${id}`, 'PATCH', { files: { [FILE]: { content: JSON.stringify({ version: 1, updatedAt: Date.now(), profiles: merged }) } } });
      }
      saveBase(id, merged);
      useSync.setState({ state: 'ok', at: Date.now(), error: undefined });
      return;
    }
    throw new SyncError('Trop de changements en même temps, nouvel essai dans un instant.');
  } catch (e) {
    applying = false;
    useSync.setState({ state: 'error', error: (e as Error).message });
  }
}

let running: Promise<void> | null = null;
let again = false;

/** Synchronise maintenant (une seule à la fois ; une demande pendant une synchro en relance une) */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    try { do { again = false; await once(); } while (again); } finally { running = null; }
  })();
  return running;
}

/** Vérifie un jeton et renvoie le nom du compte GitHub */
export async function checkToken(token: string): Promise<string> {
  const r = await window.nocta!.http(`${API}/user`, {
    headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'NOCTA' },
    timeout: 20000,
  });
  if (r.status === 401) throw new Error('Jeton refusé : vérifie que tu l\'as copié en entier.');
  if (!r.ok) throw new Error(r.status ? `GitHub a répondu ${r.status}` : 'Pas de connexion à internet');
  return (r.data as { login?: string })?.login || 'GitHub';
}

/** Arrête la synchronisation sur cet appareil (le gist et les profils restent) */
export function stopSync() {
  useStore.getState().updateSettings({ syncToken: undefined, syncGistId: undefined });
  try { localStorage.removeItem(BASE_KEY); } catch { /* pas de stockage */ }
  useSync.setState({ state: 'off', at: undefined, error: undefined });
}

/**
 * Synchro automatique : au démarrage, quelques secondes après chaque changement (épisode vu,
 * reprise, Ma liste…), à la fin d'une lecture, au retour sur l'appli et toutes les 2 minutes.
 */
export function installSync() {
  const st = useStore.getState;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { if (!st().player) syncNow(); }, ms); };

  const unsub = useStore.subscribe((s, prev) => {
    if (s.settings.syncToken !== prev.settings.syncToken && s.settings.syncToken) soon(500);
    // Fin d'une lecture : la progression part tout de suite
    if (prev.player && !s.player) soon(1500);
    else if (s.profiles !== prev.profiles && !applying) soon(8000);
  });
  const onVisible = () => { if (document.visibilityState === 'visible') soon(1000); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const tick = setInterval(() => { if (document.visibilityState === 'visible') soon(0); }, 120000);
  soon(2000);
  return () => {
    unsub();
    clearTimeout(timer);
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
