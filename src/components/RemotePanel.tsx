import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Signal, Smartphone, Wifi, X } from 'lucide-react';
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
  const [mode, setMode] = useState<'wifi' | '4g'>(() => {
    try { return localStorage.getItem('nocta-remote-mode') === '4g' ? '4g' : 'wifi'; } catch { return 'wifi'; }
  });
  const pickMode = (m: 'wifi' | '4g') => {
    setMode(m);
    try { localStorage.setItem('nocta-remote-mode', m); } catch {}
  };
  const r = window.nocta?.remote;
  if (!r) return <p className="muted">Disponible dans l'application NOCTA pour Windows.</p>;

  const toggle = async (v: boolean) => {
    setBusy(true);
    try { setSt(await r.setEnabled(v)); } finally { setBusy(false); }
  };
  const link = !st ? null : mode === '4g' ? st.tailscale : st.url && st.qr ? { url: st.url, qr: st.qr } : null;
  const refresh = async () => {
    const next = await r.status();
    setSt(next);
    if (!next.tailscale) useStore.getState().toast('Tailscale introuvable sur ce PC : vérifie qu\'il est installé et connecté', 'error');
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

      {st?.enabled && st.running && (
        <div className="remote-modes">
          <button className={mode === 'wifi' ? 'is-on' : ''} onClick={() => pickMode('wifi')}><Wifi size={16} /> Wi-Fi de la maison</button>
          <button className={mode === '4g' ? 'is-on' : ''} onClick={() => pickMode('4g')}><Signal size={16} /> 4G / 5G · Tailscale</button>
        </div>
      )}

      {st?.enabled && st.running && link && (
        <div className="remote-pair">
          <div className="remote-qr">
            <img src={link.qr} alt="QR code de la télécommande" />
            <span className="remote-qr-scan" />
          </div>
          <div className="remote-steps">
            {mode === 'wifi' ? (
              <ol>
                <li>Ton téléphone et ce PC sont sur le <b>même Wi-Fi</b> (le 2,4 GHz ou le 5 GHz de la box, peu importe).</li>
                <li>Ouvre l'<b>appareil photo</b> de l'iPhone et vise le QR code, puis touche le lien.</li>
                <li>Pour l'avoir comme une app : bouton <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.</li>
              </ol>
            ) : (
              <ol>
                <li>Sur l'iPhone, ouvre <b>Tailscale</b> et vérifie qu'il est <b>connecté</b>.</li>
                <li>Ouvre l'<b>appareil photo</b> et vise le QR code, puis touche le lien. Ça marche en 4G, partout.</li>
                <li>Pour l'avoir comme une app : bouton <b>Partager</b> puis <b>Sur l'écran d'accueil</b>. L'adresse Tailscale ne change pas.</li>
              </ol>
            )}
            <p className="remote-hint">
              Si Windows demande l'autorisation pour NOCTA, coche <b>{mode === '4g' ? 'Réseaux privés et Réseaux publics' : 'Réseaux privés'}</b> et valide.
            </p>
            <div className="remote-url">{mode === 'wifi' ? <Wifi size={14} /> : <Signal size={14} />} {link.url.replace(/\?k=.*/, '')}</div>
            <div className="remote-clients">
              {st.clients.length
                ? st.clients.map((c, i) => <span key={i} className="remote-chip is-on"><Smartphone size={14} /> {c} connecté</span>)
                : <span className="remote-chip"><span className="remote-dot" /> En attente du téléphone…</span>}
            </div>
            <button className="btn-outline" onClick={reset}><RefreshCw size={14} /> Nouveau code d'appairage</button>
          </div>
        </div>
      )}

      {st?.enabled && st.running && !link && mode === '4g' && (
        <div className="remote-setup">
          <p><b>Tailscale</b> relie ton téléphone à ton PC de façon privée, même en 4G. Gratuit, à faire une seule fois :</p>
          <ol>
            <li>Sur ce PC : installe Tailscale <a onClick={() => window.nocta?.openExternal('https://tailscale.com/download/windows')}>depuis tailscale.com</a> et connecte-toi (avec ton compte Google ou Apple).</li>
            <li>Sur l'iPhone : installe <b>Tailscale</b> depuis l'App Store et connecte-toi avec le <b>même compte</b>. Accepte l'ajout du VPN.</li>
            <li>Reviens ici et touche <b>Actualiser</b> : le QR code apparaît.</li>
          </ol>
          <button className="btn-outline" onClick={refresh}><RefreshCw size={14} /> Actualiser</button>
        </div>
      )}

      {st?.enabled && st.running && !link && mode === 'wifi' && (
        <p className="remote-error">Ce PC n'est connecté à aucun réseau local. Vérifie le câble ou le Wi-Fi, ou utilise le mode 4G / 5G.</p>
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
