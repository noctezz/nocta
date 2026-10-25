import { useEffect, useState } from 'react';
import { Check, CloudOff, ExternalLink, Loader2, RefreshCw, Tv } from 'lucide-react';
import { useStore } from '../lib/store';
import { checkToken, stopSync, syncNow, TOKEN_URL, useSync } from '../lib/sync';

/** « il y a 2 min » */
function ago(t?: number) {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'à l\'instant';
  const m = Math.round(s / 60);
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.round(m / 60)} h`;
}

/** Paramètres : synchronisation des profils entre le PC et la TV */
export function SyncCard() {
  const token = useStore((s) => s.settings.syncToken);
  const updateSettings = useStore((s) => s.updateSettings);
  const sync = useSync();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const tv = window.nocta?.platform === 'android';

  // « il y a… » tenu à jour
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const account = await checkToken(input);
      useSync.setState({ account });
      updateSettings({ syncToken: input.trim(), syncGistId: undefined });
      setInput('');
      await syncNow();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card">
      <h2>Synchronisation PC ↔ TV</h2>
      <p className="muted sync-lead">
        Reprends un épisode là où tu l'as laissé, sur n'importe quel appareil : progression, épisodes vus, Ma liste et
        journal sont partagés entre ton PC et ta TV, à travers un fichier privé de ton compte GitHub.
      </p>

      {token ? (
        <div className="sync-on">
          <div className={`sync-status is-${sync.state}`}>
            {sync.state === 'syncing' && <><Loader2 size={18} className="spin" /> Synchronisation…</>}
            {sync.state === 'ok' && <><Check size={18} /> Synchronisé {ago(sync.at)}{sync.account ? ` · ${sync.account}` : ''}</>}
            {sync.state === 'error' && <><CloudOff size={18} /> {sync.error}</>}
            {sync.state === 'off' && <><Loader2 size={18} className="spin" /> Connexion…</>}
          </div>
          <div className="sync-actions">
            <button className="btn btn-white" onClick={() => syncNow()} disabled={sync.state === 'syncing'}><RefreshCw size={16} /> Synchroniser maintenant</button>
            <button className="btn-outline" onClick={stopSync}>Désactiver sur cet appareil</button>
          </div>
          {!tv && (
            <p className="muted sync-hint"><Tv size={15} /> Pour la TV : <strong>Envoyer vers la TV</strong> (ci-dessous) lui transmet la synchronisation, rien à retaper.</p>
          )}
        </div>
      ) : (
        <div className="sync-setup">
          {tv ? (
            <p className="sync-hint"><Tv size={15} /> Le plus simple : active la synchronisation sur ton PC, puis <strong>Importer depuis mon PC</strong> sur la TV. Elle la reçoit toute seule.</p>
          ) : (
            <ol className="sync-steps">
              <li>
                Crée un jeton GitHub (une seule fois). Sur la page qui s'ouvre, choisis <strong>No expiration</strong> puis
                <strong> Generate token</strong> : seule la case « gist » est cochée.
                <button className="btn-link" onClick={() => window.nocta?.openExternal(TOKEN_URL)}>Créer le jeton <ExternalLink size={14} /></button>
              </li>
              <li>Copie le jeton (il commence par « ghp_ ») et colle-le ici.</li>
            </ol>
          )}
          <div className="sync-input">
            <input className="input" type="password" placeholder="ghp_…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && input.trim() && activate()} />
            <button className="btn btn-white" disabled={!input.trim() || busy} onClick={activate}>
              {busy ? <Loader2 size={16} className="spin" /> : null} Activer
            </button>
          </div>
          {error && <div className="status err">{error}</div>}
        </div>
      )}
    </section>
  );
}
