import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { playIntroSound } from '../lib/sound';

const ENCODERS: Record<string, string> = {
  libx264: 'Processeur (compatible partout)',
  h264_nvenc: 'Carte graphique NVIDIA (NVENC)',
  h264_qsv: 'Intel Quick Sync',
  h264_amf: 'Carte graphique AMD (AMF)',
};

const THEMES: { id: 'auto' | 'off' | 'halloween' | 'christmas'; label: string; hint: string; icon: string }[] = [
  { id: 'auto', label: 'Automatique', hint: 'Halloween en octobre, Noël en décembre', icon: '🗓️' },
  { id: 'halloween', label: 'Halloween', hint: 'Toute l\'année', icon: '🎃' },
  { id: 'christmas', label: 'Noël', hint: 'Toute l\'année', icon: '🎄' },
  { id: 'off', label: 'Désactivé', hint: 'Le NOCTA classique', icon: '🌙' },
];

export function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const mpvAvailable = useStore((s) => s.mpvAvailable);
  const [caps, setCaps] = useState<{ ffmpeg: boolean; encoders: string[] } | null>(null);

  useEffect(() => { window.nocta?.media.capabilities().then(setCaps); }, []);

  return (
    <div className="page page-padded narrow">
      <h1 className="page-title">Paramètres</h1>

      <section className="settings-card">
        <h2>Thème saisonnier</h2>
        <p className="muted">Couleurs, logo, animations et intro aux couleurs de la saison.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card theme-${t.id} ${settings.seasonalTheme === t.id ? 'is-on' : ''}`}
              onClick={() => update({ seasonalTheme: t.id })}
            >
              <span className="theme-icon">{t.icon}</span>
              <strong>{t.label}</strong>
              <small>{t.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>Lecture</h2>
        <label className="setting">
          <div>
            <strong>Lecteur vidéo</strong>
            <span>
              {mpvAvailable
                ? 'mpv intégré (comme Stremio) : tous les formats, synchro parfaite, décodage matériel.'
                : 'mpv introuvable : le lecteur de secours est utilisé.'}
            </span>
          </div>
          <select className="select" value={settings.playerEngine} onChange={(e) => update({ playerEngine: e.target.value as 'mpv' | 'web' })}>
            <option value="mpv">mpv intégré (recommandé)</option>
            <option value="web">Lecteur de secours</option>
          </select>
        </label>
        <label className="setting">
          <div>
            <strong>Bandes-annonces dans les fiches</strong>
            <span>Lance la bande-annonce (sans le son) quand tu ouvres un film ou une série.</span>
          </div>
          <input type="checkbox" className="switch" checked={settings.autoplayTrailers !== false} onChange={(e) => update({ autoplayTrailers: e.target.checked })} />
        </label>
        <label className="setting">
          <div>
            <strong>Épisode suivant automatique</strong>
            <span>Lance l'épisode suivant 5 secondes après la fin.</span>
          </div>
          <input type="checkbox" className="switch" checked={settings.autoplayNext} onChange={(e) => update({ autoplayNext: e.target.checked })} />
        </label>
        <label className="setting">
          <div>
            <strong>Langue préférée</strong>
            <span>Utilisée pour choisir la piste audio et trier les sous-titres.</span>
          </div>
          <select className="select" value={settings.preferredSubLang} onChange={(e) => update({ preferredSubLang: e.target.value })}>
            <option value="fre">Français</option>
            <option value="eng">Anglais</option>
            <option value="spa">Espagnol</option>
            <option value="ger">Allemand</option>
            <option value="ita">Italien</option>
          </select>
        </label>
        <label className="setting">
          <div>
            <strong>Taille des sous-titres</strong>
            <span>{settings.subtitleSize} %</span>
          </div>
          <input type="range" min={60} max={180} step={10} value={settings.subtitleSize} onChange={(e) => update({ subtitleSize: Number(e.target.value) })} />
        </label>
        <label className="setting">
          <div>
            <strong>Transcodage (lecteur de secours)</strong>
            <span>
              Utilisé seulement quand la vidéo n'est pas lisible telle quelle (HEVC, 10 bits…).
              {caps && !caps.ffmpeg && ' ⚠ ffmpeg introuvable : lecture directe uniquement.'}
            </span>
          </div>
          <select className="select" value={settings.encoder} onChange={(e) => update({ encoder: e.target.value })}>
            {Object.entries(ENCODERS)
              .filter(([k]) => !caps || caps.encoders.includes(k) || k === 'libx264')
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </section>

      <section className="settings-card">
        <h2>Ambiance</h2>
        <label className="setting">
          <div>
            <strong>Son d'intro</strong>
            <span>Le « ta-doum » au lancement de l'app.</span>
          </div>
          <button className="btn-outline" onClick={() => playIntroSound()}>Écouter</button>
          <input type="checkbox" className="switch" checked={settings.introSound} onChange={(e) => update({ introSound: e.target.checked })} />
        </label>
      </section>

      <p className="muted small">
        Un souci de lecture ? <a onClick={() => window.nocta?.openLogs()}>Ouvrir le dossier des journaux</a> (fichier mpv.log).
      </p>
      <p className="muted small">NOCTA v0.1 · usage personnel</p>
    </div>
  );
}
