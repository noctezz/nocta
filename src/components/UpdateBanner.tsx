import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';

/** État des mises à jour, en direct */
export function useUpdateState() {
  const [st, setSt] = useState<NoctaUpdateState | null>(null);
  useEffect(() => {
    const u = window.nocta?.update;
    if (!u) return;
    u.status().then(setSt);
    return u.on(setSt);
  }, []);
  return [st, setSt] as const;
}

const sizeOf = (b?: number) => (b ? `${Math.round(b / 1048576)} Mo` : '');

/** Carte « Nouvelle version disponible » en bas de l'écran */
export function UpdateBanner() {
  const [st] = useUpdateState();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const busy = st?.state === 'downloading' || st?.state === 'installing';
  const show = !!st && (busy || (st.state === 'available' && dismissed !== st.version) || (st.state === 'error' && dismissed !== 'error' && !!st.version));

  return (
    <AnimatePresence>
      {show && st && (
        <motion.div
          className="update-card"
          data-nav-skip
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          {!busy && (
            <button className="update-close" onClick={() => setDismissed(st.state === 'error' ? 'error' : st.version || null)} aria-label="Plus tard">
              <X size={16} />
            </button>
          )}
          <div className="update-head">
            <span className="update-icon">{busy ? <Loader2 className="spin" size={20} /> : <Sparkles size={20} />}</span>
            <div>
              <strong>
                {st.state === 'installing' ? 'Installation…' : st.state === 'downloading' ? 'Téléchargement de la mise à jour' : st.state === 'error' ? 'La mise à jour a échoué' : 'Nouvelle version de NOCTA'}
              </strong>
              <small>
                {st.state === 'installing'
                  ? 'NOCTA va redémarrer tout seul dans un instant.'
                  : st.state === 'error'
                    ? st.error
                    : `Version ${st.version}${st.size ? ` · ${sizeOf(st.size)}` : ''}`}
              </small>
            </div>
          </div>

          {st.state === 'available' && st.notes && <div className="update-notes">{st.notes}</div>}

          {busy ? (
            <div className="update-bar"><div style={{ width: `${st.progress || 0}%` }} /></div>
          ) : (
            <div className="update-actions">
              <button className="btn btn-white" onClick={() => window.nocta?.update.install()}>
                {st.state === 'error' ? <RefreshCw size={16} /> : <Download size={16} />}
                {st.portable ? 'Télécharger' : st.state === 'error' ? 'Réessayer' : 'Mettre à jour'}
              </button>
              <button className="btn-link" onClick={() => setDismissed(st.state === 'error' ? 'error' : st.version || null)}>Plus tard</button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Bloc « Mises à jour » des Paramètres */
export function UpdateSettings() {
  const [st, setSt] = useUpdateState();
  if (!window.nocta?.update) return null;
  const check = async () => setSt(await window.nocta!.update.check());
  const label = !st ? '' :
    st.state === 'checking' ? 'Recherche en cours…' :
    st.state === 'latest' ? st.note || 'Tu as la dernière version 👌' :
    st.state === 'available' ? `Version ${st.version} disponible` :
    st.state === 'downloading' ? `Téléchargement… ${st.progress || 0} %` :
    st.state === 'installing' ? 'Installation, NOCTA va redémarrer…' :
    st.state === 'error' ? `Impossible de vérifier : ${st.error}` : 'Vérification automatique au lancement';
  return (
    <section className="settings-card">
      <h2>Mises à jour</h2>
      <div className="setting">
        <div>
          <strong>NOCTA {st?.current || ''}</strong>
          <span>{label}</span>
        </div>
        {st?.state === 'available' ? (
          <button className="btn btn-white" onClick={() => window.nocta?.update.install()}><Download size={16} /> Mettre à jour</button>
        ) : (
          <button className="btn-outline" disabled={st?.state === 'checking' || st?.state === 'downloading'} onClick={check}>Rechercher</button>
        )}
      </div>
    </section>
  );
}
