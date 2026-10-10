// Client TorBox (https://api.torbox.app) — utilisé pour :
//  - vérifier la clé API et le compte
//  - savoir si un torrent est déjà en cache
//  - transformer un infoHash (renvoyé par un addon) en lien de lecture direct
//  - lister ta bibliothèque TorBox (torrents, usenet, web downloads)
const BASE = 'https://api.torbox.app/v1/api';

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv|flv)$/i;

async function call(key, endpoint, { method = 'GET', query, form } = {}) {
  const url = new URL(BASE + endpoint);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) url.searchParams.set(k, String(v));
  let body;
  if (form) {
    body = new FormData();
    for (const [k, v] of Object.entries(form)) if (v != null) body.append(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}` },
    body,
    signal: AbortSignal.timeout(25000),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok || (json && json.success === false)) {
    const msg = (json && (json.detail || json.error)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.payload = json;
    throw err;
  }
  return json ? json.data : null;
}

async function me(key) {
  return call(key, '/user/me');
}

// Renvoie l'ensemble (en minuscules) des hashes déjà en cache chez TorBox
async function checkCached(key, hashes) {
  const out = [];
  for (let i = 0; i < hashes.length; i += 80) {
    const chunk = hashes.slice(i, i + 80);
    try {
      const data = await call(key, '/torrents/checkcached', {
        query: { hash: chunk.join(','), format: 'list', list_files: 'false' },
      });
      if (Array.isArray(data)) data.forEach((d) => d && d.hash && out.push(d.hash.toLowerCase()));
      else if (data && typeof data === 'object') Object.keys(data).forEach((h) => out.push(h.toLowerCase()));
    } catch {}
  }
  return out;
}

async function findTorrentByHash(key, hash) {
  const list = await call(key, '/torrents/mylist', { query: { bypass_cache: 'true' } });
  return (list || []).find((t) => (t.hash || '').toLowerCase() === hash.toLowerCase()) || null;
}

function pickFile(files, { fileIdx, filename, season, episode }) {
  const videos = (files || []).filter((f) => VIDEO_EXT.test(f.name || f.short_name || ''));
  if (!videos.length) return null;
  const base = (f) => (f.short_name || f.name || '').split('/').pop().toLowerCase();
  if (filename) {
    const hit = videos.find((f) => base(f) === filename.toLowerCase());
    if (hit) return hit;
  }
  if (season != null && episode != null) {
    const s = Number(season), e = Number(episode);
    const re = new RegExp(`(s0*${s}[ ._-]?e0*${e}(?!\\d))|((?<!\\d)${s}x0*${e}(?!\\d))`, 'i');
    const hit = videos.find((f) => re.test(base(f)));
    if (hit) return hit;
  }
  if (fileIdx != null && files[fileIdx] && VIDEO_EXT.test(files[fileIdx].name || '')) return files[fileIdx];
  return videos.slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0];
}

function isReady(t) {
  return !!(t && (t.download_finished || t.download_present || t.cached) && t.files && t.files.length);
}

// Résout un stream d'addon (infoHash) en URL lisible.
// Renvoie { status: 'ready', url, name } ou { status: 'downloading', torrentId, progress, state }
async function resolve(key, { infoHash, fileIdx, filename, season, episode, torrentId }) {
  let id = torrentId;
  if (!id) {
    const magnet = `magnet:?xt=urn:btih:${infoHash}`;
    try {
      const data = await call(key, '/torrents/createtorrent', { method: 'POST', form: { magnet, seed: 3, allow_zip: 'false' } });
      id = data && (data.torrent_id || data.id);
    } catch (err) {
      // Torrent déjà présent sur le compte : on le retrouve dans la liste
      const existing = await findTorrentByHash(key, infoHash).catch(() => null);
      if (!existing) throw err;
      id = existing.id;
    }
    if (!id) {
      const existing = await findTorrentByHash(key, infoHash);
      id = existing && existing.id;
    }
    if (!id) throw new Error('TorBox n\'a pas renvoyé de torrent');
  }

  const t = await call(key, '/torrents/mylist', { query: { id, bypass_cache: 'true' } });
  if (!isReady(t)) {
    return {
      status: 'downloading',
      torrentId: id,
      progress: Math.round(((t && t.progress) || 0) * 100),
      state: (t && t.download_state) || 'en attente',
    };
  }
  const file = pickFile(t.files, { fileIdx, filename, season, episode });
  if (!file) throw new Error('Aucun fichier vidéo dans ce torrent');
  const url = await call(key, '/torrents/requestdl', { query: { token: key, torrent_id: id, file_id: file.id } });
  return { status: 'ready', url, name: (file.short_name || file.name || '').split('/').pop() };
}

// Bibliothèque : torrents + usenet + web downloads terminés, aplatis en fichiers vidéo
async function library(key) {
  const kinds = [
    { kind: 'torrent', list: '/torrents/mylist' },
    { kind: 'usenet', list: '/usenet/mylist' },
    { kind: 'webdl', list: '/webdl/mylist' },
  ];
  const out = [];
  for (const k of kinds) {
    let items = [];
    try { items = (await call(key, k.list, { query: { bypass_cache: 'true' } })) || []; } catch { continue; }
    for (const it of items) {
      const files = (it.files || []).filter((f) => VIDEO_EXT.test(f.name || ''));
      out.push({
        kind: k.kind,
        id: it.id,
        name: it.name,
        size: it.size,
        ready: !!(it.download_finished || it.download_present || it.cached),
        progress: Math.round((it.progress || 0) * 100),
        createdAt: it.created_at,
        files: files.map((f) => ({ id: f.id, name: (f.short_name || f.name || '').split('/').pop(), size: f.size })),
      });
    }
  }
  return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function libraryLink(key, kind, id, fileId) {
  const map = {
    torrent: ['/torrents/requestdl', 'torrent_id'],
    usenet: ['/usenet/requestdl', 'usenet_id'],
    webdl: ['/webdl/requestdl', 'web_id'],
  };
  const [ep, param] = map[kind] || map.torrent;
  return call(key, ep, { query: { token: key, [param]: id, file_id: fileId } });
}

module.exports = { me, checkCached, resolve, library, libraryLink };
