// Nettoyage TorBox : quand NOCTA ouvre une source pour vérifier sa langue, l'addon (Comet,
// Torrentio…) ajoute le torrent à ton compte TorBox. Si la source n'est pas en VF, ce torrent
// est retiré de ta liste. Sécurité : seul un torrent apparu PENDANT la vérification peut être
// supprimé, jamais un torrent que tu avais déjà.
import { useStore } from './store';
import type { Stream } from './types';

const API = 'https://api.torbox.app/v1/api';

interface TbTorrent { id: number; hash?: string; name?: string; created_at?: string }

const keyOf = () => (useStore.getState().settings.torboxKey || '').trim();
export const cleanupEnabled = () => !!keyOf() && useStore.getState().settings.torboxCleanup !== false && !!window.nocta;

async function call(path: string, init: { method?: string; body?: unknown } = {}) {
  const r = await window.nocta!.http(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${keyOf()}`, 'Content-Type': 'application/json', 'User-Agent': 'NOCTA' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    timeout: 15000,
  });
  const d = r.data as { success?: boolean; data?: unknown; detail?: string; error?: string } | string | undefined;
  if (!r.ok || typeof d !== 'object' || !d || d.success === false) {
    throw new Error((typeof d === 'object' && d && (d.detail || d.error)) || `TorBox ${r.status || 'injoignable'}`);
  }
  return d.data;
}

async function list(): Promise<TbTorrent[]> {
  const data = await call('/torrents/mylist?bypass_cache=true');
  return Array.isArray(data) ? (data as TbTorrent[]) : [];
}

/** Vérifie la clé : renvoie l'e-mail du compte */
export async function testKey(): Promise<string> {
  const me = (await call('/user/me')) as { email?: string } | null;
  return me?.email || 'compte TorBox';
}

/** Liste des torrents avant d'ouvrir une source (null = impossible, on ne nettoiera pas) */
export async function snapshot(): Promise<Set<number> | null> {
  if (!cleanupEnabled()) return null;
  try { return new Set((await list()).map((t) => t.id)); } catch { return null; }
}

// Empreinte (hash) du torrent : présente dans l'URL des addons débrid ou dans les infos du flux
function hashOf(s: Stream): string | null {
  if (s.infoHash && /^[a-f0-9]{40}$/i.test(s.infoHash)) return s.infoHash.toLowerCase();
  const m = /(?:^|[^a-f0-9])([a-f0-9]{40})(?:[^a-f0-9]|$)/i.exec(`${s.url || ''} ${s.behaviorHints?.bingeGroup || ''}`);
  return m ? m[1].toLowerCase() : null;
}

const norm = (t: string) => t.toLowerCase().replace(/\.(mkv|mp4|avi)$/i, '').replace(/[^a-z0-9]+/g, '');
function namesOf(s: Stream): string[] {
  const out = [s.behaviorHints?.filename, (s.title || s.description || '').split('\n')[0]]
    .filter((x): x is string => !!x && x.length > 6)
    .map((x) => norm(x.replace(/^[^\w]+/, '')));
  return out.filter((x) => x.length > 6);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retire de TorBox le torrent ajouté par la vérification d'une source qui n'est pas en VF.
 * Ne supprime rien en cas de doute (aucune correspondance, ou plusieurs possibles).
 */
export async function cleanup(s: Stream, before: Set<number>): Promise<boolean> {
  const hash = hashOf(s);
  const names = namesOf(s);
  if (!hash && !names.length) return false;
  // Le torrent peut mettre un instant à apparaître dans la liste
  for (const wait of [0, 1500, 3000, 5000]) {
    if (wait) await sleep(wait);
    let fresh: TbTorrent[];
    try { fresh = (await list()).filter((t) => !before.has(t.id)); } catch { return false; }
    const matches = hash
      ? fresh.filter((t) => (t.hash || '').toLowerCase() === hash)
      : fresh.filter((t) => names.includes(norm(t.name || '')));
    if (matches.length === 1) {
      try {
        await call('/torrents/controltorrent', { method: 'POST', body: { torrent_id: matches[0].id, operation: 'delete' } });
      } catch { return false; }
      const st = useStore.getState();
      st.updateSettings({ torboxCleaned: (st.settings.torboxCleaned || 0) + 1 });
      return true;
    }
    if (matches.length > 1) return false;
  }
  return false;
}
