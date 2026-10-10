import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Film, Loader2, Play, RefreshCw, Zap } from 'lucide-react';
import { useStore } from '../lib/store';
import { errMsg } from '../lib/playback';

interface LibItem {
  kind: 'torrent' | 'usenet' | 'webdl';
  id: number;
  name: string;
  size: number;
  ready: boolean;
  progress: number;
  files: { id: number; name: string; size: number }[];
}

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} Go` : `${Math.round(b / 1e6)} Mo`);
const KIND: Record<string, string> = { torrent: 'Torrent', usenet: 'Usenet', webdl: 'Web' };

export function TorboxLibrary() {
  const key = useStore((s) => s.settings.torboxKey);
  const setPage = useStore((s) => s.setPage);
  const play = useStore((s) => s.play);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<LibItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!key || !window.nocta) return;
    setItems(null);
    setError(null);
    try { setItems(await window.nocta.torbox('library', key)); } catch (e) { setError(errMsg(e)); setItems([]); }
  }, [key]);

  useEffect(() => { refresh(); }, [refresh]);

  const playFile = async (it: LibItem, f: { id: number; name: string }) => {
    const k = `${it.kind}${it.id}-${f.id}`;
    setBusy(k);
    try {
      const url: string = await window.nocta!.torbox('libraryLink', key, it.kind, it.id, f.id);
      play({ src: url, title: f.name.replace(/\.[^.]+$/, ''), subtitle: it.name !== f.name ? it.name : undefined, stream: { url } });
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!key) {
    return (
      <div className="page page-padded narrow">
        <h1 className="page-title">TorBox</h1>
        <div className="empty big">
          <Zap size={48} />
          <h3>Connecte ton compte TorBox</h3>
          <p>Ajoute ta clé API dans les paramètres pour accéder à ta bibliothèque et lire les sources TorBox.</p>
          <button className="btn btn-white" onClick={() => setPage('settings')}>Ouvrir les paramètres</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-padded narrow">
      <div className="title-row">
        <h1 className="page-title">Ma bibliothèque TorBox</h1>
        <button className="btn-outline" onClick={refresh}><RefreshCw size={16} /> Actualiser</button>
      </div>
      {error && <p className="status err">{error}</p>}
      {items === null && <div className="lib-loading"><Loader2 className="spin" size={28} /></div>}
      {items && items.length === 0 && !error && (
        <div className="empty big"><Film size={48} /><h3>Rien pour l'instant</h3><p>Les fichiers ajoutés sur TorBox apparaîtront ici.</p></div>
      )}
      <div className="lib-list">
        {items?.map((it, i) => {
          const id = `${it.kind}${it.id}`;
          const isOpen = open === id;
          return (
            <motion.div key={id} className={`lib-item ${isOpen ? 'is-open' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}>
              <button
                className="lib-head"
                onClick={() => (it.files.length === 1 && it.ready ? playFile(it, it.files[0]) : setOpen(isOpen ? null : id))}
              >
                <span className="tag">{KIND[it.kind]}</span>
                <span className="lib-name">{it.name}</span>
                <span className="muted">{it.size ? fmtSize(it.size) : ''}</span>
                {it.ready
                  ? (it.files.length === 1
                    ? (busy === `${id}-${it.files[0].id}` ? <Loader2 className="spin" size={20} /> : <Play size={20} fill="currentColor" />)
                    : <ChevronDown size={20} className={isOpen ? 'rot' : ''} />)
                  : <span className="lib-progress"><span style={{ width: `${it.progress}%` }} /> {it.progress}%</span>}
              </button>
              {isOpen && it.ready && (
                <div className="lib-files">
                  {it.files.length === 0 && <p className="muted">Aucune vidéo dans ce dossier.</p>}
                  {it.files.map((f) => {
                    const k = `${id}-${f.id}`;
                    return (
                      <button key={f.id} className="lib-file" onClick={() => playFile(it, f)} disabled={!!busy}>
                        {busy === k ? <Loader2 className="spin" size={16} /> : <Play size={16} fill="currentColor" />}
                        <span>{f.name}</span>
                        <span className="muted">{fmtSize(f.size)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
