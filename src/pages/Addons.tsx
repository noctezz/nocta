import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Loader2, Plus, Puzzle, RefreshCw, Trash2, Zap } from 'lucide-react';
import { fetchManifest, normalizeManifestUrl, OPENSUBTITLES_URL } from '../lib/addons';
import { useStore } from '../lib/store';
import { errMsg } from '../lib/playback';
import type { ResourceDef } from '../lib/types';

const resName = (r: ResourceDef) => (typeof r === 'string' ? r : r.name);
const RES_FR: Record<string, string> = { catalog: 'Catalogue', meta: 'Fiches', stream: 'Sources', subtitles: 'Sous-titres', addon_catalog: 'Addons' };

export function Addons() {
  const addons = useStore((s) => s.addons);
  const setAddons = useStore((s) => s.setAddons);
  const toast = useStore((s) => s.toast);
  const key = useStore((s) => s.settings.torboxKey);
  const setPage = useStore((s) => s.setPage);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const install = async (raw: string) => {
    if (!raw.trim()) return;
    setBusy(true);
    try {
      const u = normalizeManifestUrl(raw);
      const manifest = await fetchManifest(u);
      const current = useStore.getState().addons;
      const exists = current.findIndex((a) => a.manifest.id === manifest.id);
      const next = exists >= 0
        ? current.map((a, i) => (i === exists ? { url: u, manifest } : a))
        : [...current, { url: u, manifest }];
      setAddons(next);
      setUrl('');
      toast(`${manifest.name} ${exists >= 0 ? 'mis à jour' : 'installé'} ✓`, 'success');
    } catch (e) {
      toast(`Installation impossible : ${errMsg(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = (u: string) => setAddons(addons.filter((a) => a.url !== u));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= addons.length) return;
    const next = addons.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAddons(next);
  };

  const hasTorboxAddon = addons.some((a) => /torbox/i.test(a.url) || /torbox/i.test(a.manifest.name));
  const hasSubs = addons.some((a) => a.url === OPENSUBTITLES_URL);

  return (
    <div className="page page-padded narrow">
      <h1 className="page-title">Addons</h1>
      <p className="lead">
        NOCTA utilise le même système d'addons que Stremio : colle l'URL d'un <code>manifest.json</code> pour ajouter
        des catalogues, des sources ou des sous-titres.
      </p>

      <div className="install-box">
        <Puzzle size={22} />
        <input
          className="input"
          placeholder="https://…/manifest.json  ou  stremio://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && install(url)}
        />
        <button className="btn btn-red" onClick={() => install(url)} disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} Installer
        </button>
      </div>

      {(!hasTorboxAddon || !hasSubs) && (
        <div className="suggest">
          {!hasTorboxAddon && (
            <div className="suggest-card">
              <Zap size={22} />
              <div>
                <strong>Addon TorBox</strong>
                <p>Les sources de lecture de ton compte TorBox, directement dans les fiches.</p>
              </div>
              {key ? (
                <button className="btn btn-white" disabled={busy} onClick={() => install(`https://stremio.torbox.app/${key}/manifest.json`)}>Installer</button>
              ) : (
                <button className="btn-outline" onClick={() => setPage('settings')}>Ajouter ma clé</button>
              )}
            </div>
          )}
          {!hasSubs && (
            <div className="suggest-card">
              <Puzzle size={22} />
              <div>
                <strong>OpenSubtitles v3</strong>
                <p>Sous-titres dans toutes les langues pour films et séries.</p>
              </div>
              <button className="btn btn-white" disabled={busy} onClick={() => install(OPENSUBTITLES_URL)}>Installer</button>
            </div>
          )}
        </div>
      )}

      <div className="addon-list">
        <AnimatePresence initial={false}>
          {addons.map((a, i) => (
            <motion.div
              key={a.url}
              className="addon"
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -30 }}
            >
              <div className="addon-logo">
                {a.manifest.logo ? <img src={a.manifest.logo} alt="" /> : <Puzzle size={26} />}
              </div>
              <div className="addon-info">
                <div className="addon-name">{a.manifest.name} <small>v{a.manifest.version}</small></div>
                {a.manifest.description && <p>{a.manifest.description}</p>}
                <div className="stream-tags">
                  {(a.manifest.resources || []).map((r) => <span key={resName(r)} className="tag">{RES_FR[resName(r)] || resName(r)}</span>)}
                  {(a.manifest.types || []).map((t) => <span key={t} className="tag tag-dim">{t}</span>)}
                </div>
              </div>
              <div className="addon-actions">
                <button className="icon-btn" title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className="icon-btn" title="Descendre" onClick={() => move(i, 1)} disabled={i === addons.length - 1}>↓</button>
                <button className="icon-btn" title="Actualiser" onClick={() => install(a.url)}><RefreshCw size={16} /></button>
                <button className="icon-btn" title="Ouvrir" onClick={() => window.nocta?.openExternal(a.url)}><ExternalLink size={16} /></button>
                <button className="icon-btn danger" title="Supprimer" onClick={() => remove(a.url)}><Trash2 size={16} /></button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
