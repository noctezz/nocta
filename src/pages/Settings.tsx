import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { errMsg } from '../lib/playback';
import { playIntroSound } from '../lib/sound';

const ENCODERS: Record<string, string> = {
  libx264: 'Processeur (compatible partout)',
  h264_nvenc: 'Carte graphique NVIDIA (NVENC)',
  h264_qsv: 'Intel Quick Sync',
  h264_amf: 'Carte graphique AMD (AMF)',
};

export function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const mpvAvailable = useStore((s) => s.mpvAvailable);
  const [key, setKey] = useState(settings.torboxKey);
  const [show, setShow] = useState(false);
  const [check, setCheck] = useState<{ state: 'idle' | 'loading' | 'ok' | 'err'; text?: string }>({ state: 'idle' });
  const [caps, setCaps] = useState<{ ffmpeg: boolean; encoders: string[] } | null>(null);

  useEffect(() => { window.nocta?.media.capabilities().then(setCaps); }, []);

  const saveKey = async () => {
    const k = key.trim();
    update({ torboxKey: k });
    if (!k) return setCheck({ state: 'idle' });
    if (!window.nocta) return;
    setCheck({ state: 'loading' });
    try {
      const me = await window.nocta.torbox('me', k);
      const plan = ['Gratuit', 'Essential', 'Pro', 'Standard'][me?.plan] ?? `plan ${me?.plan}`;
      setCheck({ state: 'ok', text: `Connecté : ${me?.email || 'compte TorBox'} · ${plan}` });
    } catch (e) {
      setCheck({ state: 'err', text: errMsg(e) });
    }
  };

  return (
    <div className="page page-padded narrow">
      <h1 className="page-title">Paramètres</h1>

      <section className="settings-card">
        <h2>TorBox</h2>
        <p className="muted">
          Ta clé API se trouve sur <a onClick={() => window.nocta?.openExternal('https://torbox.app/settings')}>torbox.app/settings</a>.
          Elle reste stockée uniquement sur ton PC.
        </p>
        <div className="key-row">
          <input
            className="input"
            type={show ? 'text' : 'password'}
            placeholder="Clé API TorBox"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveKey()}
          />
          <button className="icon-btn" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          <button className="btn btn-red" onClick={saveKey}>Enregistrer & tester</button>
        </div>
        {check.state === 'loading' && <p className="status"><Loader2 className="spin" size={16} /> Vérification…</p>}
        {check.state === 'ok' && <p className="status ok"><CheckCircle2 size={16} /> {check.text}</p>}
        {check.state === 'err' && <p className="status err"><XCircle size={16} /> {check.text}</p>}
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

      <p className="muted small">NOCTA v0.1 · usage personnel</p>
    </div>
  );
}
