import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { playIntroSound } from '../lib/sound';
import { RemotePanel } from '../components/RemotePanel';
import { UpdateSettings } from '../components/UpdateBanner';
import { testKey } from '../lib/torbox';
import { AiKeyList } from '../components/AiKeys';
import { testTmdb } from '../lib/xray';

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

/** Nettoyage TorBox des sources ouvertes pour vérifier la VF */
function TorboxCleanup() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const [key, setKey] = useState(settings.torboxKey || '');
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const k = key.trim();
    update({ torboxKey: k });
    if (!k) { setTest(null); return; }
    setBusy(true);
    try { setTest({ ok: true, text: `Connecté : ${await testKey()}` }); }
    catch (e) { setTest({ ok: false, text: `Clé refusée : ${String((e as Error).message || e)}` }); }
    finally { setBusy(false); }
  };

  return (
    <div className="setting setting-col">
      <div className="setting-row">
        <div>
          <strong>Nettoyer TorBox après la vérification</strong>
          <span>
            Pour lire la langue d'une source, ton addon l'ajoute à ton compte TorBox. NOCTA s'arrête à la première
            source dans la bonne langue (VF, ou VO selon le titre) et retire de ta liste toutes celles essayées pour
            rien : il ne reste qu'une source par film ou épisode. Ce que tu avais déjà n'est jamais touché.
          </span>
        </div>
        <input type="checkbox" className="switch" disabled={!settings.torboxKey} checked={!!settings.torboxKey && settings.torboxCleanup !== false} onChange={(e) => update({ torboxCleanup: e.target.checked })} />
      </div>
      <div className="key-row">
        <input
          className="input"
          type="password"
          placeholder="Clé API TorBox (torbox.app → Settings → API Key)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn-outline" disabled={busy} onClick={save}>{busy ? 'Test…' : key.trim() === (settings.torboxKey || '') && key ? 'Tester' : 'Enregistrer'}</button>
      </div>
      {test && <div className={`status ${test.ok ? 'ok' : 'err'}`}>{test.text}</div>}
      {!!settings.torboxCleaned && <div className="status">{settings.torboxCleaned} source{settings.torboxCleaned > 1 ? 's' : ''} essayée{settings.torboxCleaned > 1 ? 's' : ''} retirée{settings.torboxCleaned > 1 ? 's' : ''} de TorBox</div>}
      <small className="muted">La clé reste sur ce PC et ne sert qu'à ce nettoyage.</small>
    </div>
  );
}

/** X-Ray : affichage à la pause et clé TMDB facultative (photos et personnages précis) */
function XRaySettings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const [key, setKey] = useState(settings.tmdbKey || '');
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});
  const save = async () => {
    const k = key.trim();
    if (!k) { update({ tmdbKey: undefined }); setState({}); return; }
    setState({ busy: true });
    const ok = await testTmdb(k).catch(() => false);
    if (ok) update({ tmdbKey: k });
    setState(ok ? { ok: true, text: 'Clé TMDB enregistrée : photos et personnages précis activés' } : { ok: false, text: 'Clé refusée par TMDB' });
  };
  return (
    <section className="settings-card">
      <h2><span className="xr-logo xr-logo-lg">X-RAY</span></h2>
      <p className="muted">Pendant la lecture : qui est à l'écran, qui joue qui, ce qui vient de se passer. Bouton X-Ray du lecteur ou touche X.</p>
      <Toggle
        title="Afficher l'X-Ray à la pause"
        hint="Quand tu mets pause, les personnages de la scène apparaissent en bas de l'image."
        checked={settings.xrayOnPause !== false}
        onChange={(v) => update({ xrayOnPause: v })}
      />
      <div className="setting setting-col">
        <div>
          <strong>Clé TMDB (facultative, gratuite)</strong>
          <span>Sans clé, l'X-Ray utilise le casting de la fiche et les photos de Wikipédia. Avec une clé TMDB : photos de tout le casting, personnages exacts, invités de chaque épisode et filmographies. Crée un compte, puis Paramètres → API → « Clé d'API ».</span>
        </div>
        <div className="key-row">
          <input className="input" type="password" placeholder="Clé d'API TMDB" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn-outline" onClick={() => window.nocta?.openExternal('https://www.themoviedb.org/settings/api')}>Créer ma clé ↗</button>
          <button className="btn-outline" disabled={state.busy} onClick={save}>{state.busy ? 'Test…' : 'Enregistrer'}</button>
        </div>
        {state.text && <div className={`status ${state.ok ? 'ok' : 'err'}`}>{state.text}</div>}
      </div>
      <div className="setting setting-col">
        <div>
          <strong>Clés d'IA (gratuites)</strong>
          <span>L'X-Ray utilise une IA gratuite pour reconnaître la scène, te faire le rattrapage et trouver des anecdotes. Ajoute plusieurs clés : si un service est saturé ou à court de quota, le suivant prend le relais, dans l'ordre de la liste. Les clés restent sur ce PC.</span>
        </div>
        <AiKeyList />
      </div>
    </section>
  );
}

type Tab = 'essentiel' | 'avance';

/** Interrupteur avec titre et explication */
function Toggle({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting">
      <div>
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const mpvAvailable = useStore((s) => s.mpvAvailable);
  const introCount = useStore((s) => Object.keys(s.introMarks || {}).length);
  const [caps, setCaps] = useState<{ ffmpeg: boolean; encoders: string[] } | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    try { return localStorage.getItem('nocta-settings-tab') === 'avance' ? 'avance' : 'essentiel'; } catch { return 'essentiel'; }
  });
  const pickTab = (t: Tab) => {
    setTab(t);
    try { localStorage.setItem('nocta-settings-tab', t); } catch {}
  };

  useEffect(() => { window.nocta?.media.capabilities().then(setCaps); }, []);

  return (
    <div className="page page-padded narrow">
      <h1 className="page-title">Paramètres</h1>

      <div className="settings-tabs">
        <button className={tab === 'essentiel' ? 'is-on' : ''} onClick={() => pickTab('essentiel')}>
          <span>🍿</span> L'essentiel
        </button>
        <button className={tab === 'avance' ? 'is-on' : ''} onClick={() => pickTab('avance')}>
          <span>🛠️</span> Avancé
        </button>
      </div>

      {tab === 'essentiel' && (
        <>
          <section className="settings-card">
            <h2>Lecture</h2>
            <p className="muted">Tu choisis un titre, tu appuies sur Lecture, NOCTA s'occupe du reste.</p>
            <div className="setting">
              <div>
                <strong>Langue par défaut</strong>
                <span>Pour tous les films et séries. Tu peux la changer titre par titre sur leur fiche.</span>
              </div>
              <div className="seg">
                <button className={settings.preferFrench ? 'is-on' : ''} onClick={() => update({ preferFrench: true })}>VF</button>
                <button className={!settings.preferFrench ? 'is-on' : ''} onClick={() => update({ preferFrench: false })}>VO · sous-titres FR</button>
              </div>
            </div>
            <div className="setting">
              <div>
                <strong>Ambilight</strong>
                <span>Un halo aux couleurs de l'image autour de la vidéo, comme les TV Philips. « Immersif » réduit un peu la vidéo pour que la lumière l'entoure. Aussi dans le lecteur : bouton ☀ ou touche L.</span>
              </div>
              <div className="seg">
                {([['off', 'Non'], ['bars', 'Bandes noires'], ['immersive', 'Immersif']] as const).map(([v, label]) => (
                  <button key={v} className={(settings.ambilight || 'immersive') === v ? 'is-on' : ''} onClick={() => update({ ambilight: v })}>{label}</button>
                ))}
              </div>
            </div>
            <Toggle
              title="Masquer la 4K et l'HDR"
              hint="Le meilleur 1080p, sans 4K, HDR ni Dolby Vision (sauf s'il n'existe rien d'autre)."
              checked={settings.hideUhd !== false}
              onChange={(v) => update({ hideUhd: v })}
            />
            <Toggle
              title="Épisode suivant automatique"
              hint="L'épisode suivant se lance 5 secondes après la fin."
              checked={settings.autoplayNext}
              onChange={(v) => update({ autoplayNext: v })}
            />
            <Toggle
              title="Passer le générique automatiquement"
              hint="Sinon, un bouton « Passer l'intro » s'affiche pendant le générique."
              checked={settings.autoSkipIntro}
              onChange={(v) => update({ autoSkipIntro: v })}
            />
          </section>

          <section className="settings-card">
            <h2>Confort</h2>
            <Toggle
              title="Bandes-annonces dans les fiches"
              hint="La bande-annonce se lance (sans le son) quand tu ouvres un film ou une série."
              checked={settings.autoplayTrailers !== false}
              onChange={(v) => update({ autoplayTrailers: v })}
            />
            <label className="setting">
              <div>
                <strong>Son d'intro</strong>
                <span>Le « ta-doum » au lancement de l'app.</span>
              </div>
              <button className="btn-outline" onClick={() => playIntroSound()}>Écouter</button>
              <input type="checkbox" className="switch" checked={settings.introSound} onChange={(e) => update({ introSound: e.target.checked })} />
            </label>
            <label className="setting">
              <div>
                <strong>Taille des sous-titres</strong>
                <span>{settings.subtitleSize} %</span>
              </div>
              <input type="range" min={60} max={180} step={10} value={settings.subtitleSize} onChange={(e) => update({ subtitleSize: Number(e.target.value) })} />
            </label>
            <div className="setting setting-col">
              <div>
                <strong>Thème saisonnier</strong>
                <span>Couleurs, logo, animations et intro aux couleurs de la saison.</span>
              </div>
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
            </div>
          </section>

          <section className="settings-card">
            <h2>Télécommande</h2>
            <RemotePanel />
          </section>

          <UpdateSettings />
        </>
      )}

      {tab === 'avance' && (
        <>
          <section className="settings-card">
            <h2>Sources et TorBox</h2>
            <Toggle
              title={settings.preferFrench ? 'Vérifier la vraie VF' : 'Vérifier la vraie langue'}
              hint="Avant de lancer, NOCTA ouvre les sources une par une et lit leurs vraies pistes audio, jusqu'à la première dans la bonne langue (VF, ou VO selon le titre). Les fausses VF sont écartées."
              checked={settings.verifyLanguage !== false}
              onChange={(v) => update({ verifyLanguage: v })}
            />
            {settings.verifyLanguage !== false && <TorboxCleanup />}
            <label className="setting">
              <div>
                <strong>Qualité maximale</strong>
                <span>La meilleure source au plus près de cette qualité (les liens instantanés passent en premier).</span>
              </div>
              <select className="select" value={settings.maxResolution} onChange={(e) => update({ maxResolution: Number(e.target.value) as 2160 | 1080 | 720 })}>
                <option value={2160}>4K</option>
                <option value={1080}>1080p</option>
                <option value={720}>720p</option>
              </select>
            </label>
          </section>

          <XRaySettings />

          <section className="settings-card">
            <h2>Générique</h2>
            <Toggle
              title="Détection du générique"
              hint="Compare le son du début des épisodes pour trouver le générique de n'importe quelle série. Les premières minutes de l'épisode voisin sont téléchargées en arrière-plan."
              checked={settings.introDetection !== false}
              onChange={(v) => update({ introDetection: v })}
            />
            {introCount > 0 && (
              <div className="setting">
                <div>
                  <strong>Génériques mémorisés</strong>
                  <span>{introCount} épisode{introCount > 1 ? 's' : ''} ou série{introCount > 1 ? 's' : ''}</span>
                </div>
                <button className="btn-outline" onClick={() => useStore.setState({ introMarks: {} })}>Oublier</button>
              </div>
            )}
          </section>

          <section className="settings-card">
            <h2>Lecteur</h2>
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
                <strong>Langue des pistes</strong>
                <span>Piste audio choisie en VF, et ordre des sous-titres dans le menu du lecteur.</span>
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

          <p className="muted small">
            Un souci de lecture ? <a onClick={() => window.nocta?.openLogs()}>Ouvrir le dossier des journaux</a> (fichier mpv.log).
          </p>
        </>
      )}

      <p className="muted small">NOCTA · usage personnel</p>
    </div>
  );
}
