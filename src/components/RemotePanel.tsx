import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Smartphone, Wifi, X } from 'lucide-react';
import { useStore } from '../lib/store';

/** Statut de la télécommande, mis à jour en direct */
export function useRemoteStatus() {
  const [st, setSt] = useState<NoctaRemoteStatus | null>(null);
  useEffect(() => {
    const r = window.nocta?.remote;
    if (!r) return;
    r.status().then(setSt);
    return r.on('status', setSt);
  }, []);
  return [st, setSt] as const;
}

/** QR code + réglages de la télécommande (Paramètres et fenêtre dédiée) */
export function RemotePanel({ compact }: { compact?: boolean }) {
  const [st, setSt] = useRemoteStatus();
  const [busy, setBusy] = useState(false);
  const r = window.nocta?.remote;
  if (!r) return <p className="muted">Disponible dans l'application NOCTA pour Windows.</p>;

  const toggle = async (v: boolean) => {
    setBusy(true);
    try { setSt(await r.setEnabled(v)); } finally { setBusy(false); }
  };
  const reset = async () => {
    setSt(await r.reset());
    useStore.getState().toast('Nouveau code : rescanne le QR code avec ton téléphone', 'info');
  };

  return (
    <div className={`remote-panel ${compact ? 'is-compact' : ''}`}>
      <label className="setting">
        <div>
          <strong>Activer la télécommande</strong>
          <span>Pilote NOCTA depuis ton iPhone ou ton téléphone Android, sans rien installer.</span>
        </div>
        <input type="checkbox" className="switch" disabled={busy || !st} checked={!!st?.enabled} onChange={(e) => toggle(e.target.checked)} />
      </label>

      {st?.enabled && st.error && <p className="remote-error">Impossible de démarrer la télécommande : {st.error}</p>}

      {st?.enabled && st.url && (
        <div className="remote-pair">
          <div className="remote-qr">
            <img src={st.qr || ''} alt="QR code de la télécommande" />
            <span className="remote-qr-scan" />
          </div>
          <div className="remote-steps">
            <ol>
              <li>Ton téléphone et ce PC sont sur le <b>même Wi-Fi</b>.</li>
              <li>Ouvre l'<b>appareil photo</b> de l'iPhone et vise le QR code, puis touche le lien.</li>
              <li>Pour l'avoir comme une app : bouton <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.</li>
            </ol>
            <p className="remote-hint">
              Si Windows demande l'autorisation pour NOCTA, coche <b>Réseaux privés</b> et valide.
            </p>
            <div className="remote-url"><Wifi size={14} /> {st.url.replace(/\?k=.*/, '')}</div>
            <div className="remote-clients">
              {st.clients.length
                ? st.clients.map((c, i) => <span key={i} className="remote-chip is-on"><Smartphone size={14} /> {c} connecté</span>)
                : <span className="remote-chip"><span className="remote-dot" /> En attente du téléphone…</span>}
            </div>
            <button className="btn-outline" onClick={reset}><RefreshCw size={14} /> Nouveau code d'appairage</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Fenêtre ouverte depuis l'icône téléphone de la barre du haut */
export function RemoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop remote-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="remote-modal"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            <button className="round remote-close" data-nav-back onClick={onClose} aria-label="Fermer"><X size={20} /></button>
            <div className="remote-modal-head">
              <span className="remote-modal-icon"><Smartphone size={26} /></span>
              <div>
                <h2>Télécommande</h2>
                <p className="muted">Ton téléphone devient la télécommande de NOCTA.</p>
              </div>
            </div>
            <RemotePanel compact />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
