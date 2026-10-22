import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Delete, Laptop, Loader2, MonitorSmartphone, RefreshCw, Tv, X } from 'lucide-react';
import { useStore } from '../lib/store';

const PORT = 7990;

// ---------------------------------------------------------------- PC : « Envoyer vers la TV »

/** Paramètres du PC : partage les profils, addons et réglages avec l'appli de la TV */
export function SendToTv() {
  const t = window.nocta?.transfer;
  const [st, setSt] = useState<{ code: string; until: number; ips: string[]; name: string; error?: string } | null>(null);
  const [done, setDone] = useState<null | 'ok' | 'timeout' | 'tries'>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => t?.onDone((r) => { setSt(null); setDone(r.ok ? 'ok' : r.reason === 'tries' ? 'tries' : 'timeout'); }), [t]);
  useEffect(() => {
    if (!st) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [st]);
  useEffect(() => () => { t?.stop(); }, [t]);
  if (!t) return null;

  const start = async () => { setDone(null); setSt(await t.start()); };
  const left = st ? Math.max(0, Math.round((st.until - now) / 1000)) : 0;

  return (
    <div className="tvx-send">
      <div className="tvx-send-head">
        <Tv size={30} />
        <div>
          <strong>Envoyer vers la TV</strong>
          <span>Profils, journal, addons, clé TorBox et réglages : copiés sur l'appli NOCTA de ta TV (Bbox, TV Android), sans rien retaper.</span>
        </div>
        {!st && <button className="btn btn-white" onClick={start}>Envoyer vers la TV</button>}
      </div>
      <AnimatePresence>
        {st && !st.error && (
          <motion.div className="tvx-code-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="tvx-code">{st.code.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <ol>
              <li>Sur la TV, ouvre NOCTA puis <strong>Importer depuis mon PC</strong>.</li>
              <li>Choisis <strong>{st.name}</strong> et tape ce code.</li>
            </ol>
            <small>Adresse du PC : {st.ips[0] || 'inconnue'} · le partage s'arrête dans {Math.floor(left / 60)} min {String(left % 60).padStart(2, '0')}</small>
            <button className="btn-link" onClick={() => { t.stop(); setSt(null); }}>Annuler</button>
          </motion.div>
        )}
      </AnimatePresence>
      {st?.error && <div className="status err">{st.error}</div>}
      {done === 'ok' && <div className="status ok">Envoyé à la TV ✓</div>}
      {done === 'timeout' && <div className="status">Partage arrêté (10 minutes écoulées).</div>}
      {done === 'tries' && <div className="status err">Trop de codes faux : partage arrêté par sécurité.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- TV : « Importer depuis mon PC »

interface FoundPc { ip: string; name: string }

/** Cherche les PC qui partagent NOCTA sur le réseau local de la TV */
async function scan(onFound: (pc: FoundPc) => void, signal: { stop: boolean }) {
  const ip = (await window.nocta?.tv?.localIp().catch(() => '')) || '';
  const prefixes = ip ? [ip.split('.').slice(0, 3).join('.')] : ['192.168.1', '192.168.0'];
  const targets = prefixes.flatMap((p) => Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`)).filter((x) => x !== ip);
  let next = 0;
  const worker = async () => {
    while (next < targets.length && !signal.stop) {
      const host = targets[next++];
      const r = await window.nocta!.http(`http://${host}:${PORT}/nocta`, { timeout: 1500 }).catch(() => null);
      if (r?.ok && (r.data as { nocta?: boolean })?.nocta) onFound({ ip: host, name: (r.data as { name?: string }).name || host });
    }
  };
  await Promise.all(Array.from({ length: 40 }, worker));
}

export function ImportFromPc({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState<FoundPc[]>([]);
  const [scanning, setScanning] = useState(true);
  const [pc, setPc] = useState<FoundPc | null>(null);
  const [code, setCode] = useState('');
  const [state, setState] = useState<{ busy?: boolean; error?: string; ok?: boolean }>({});
  const [manual, setManual] = useState('');
  const signal = useRef({ stop: false });

  const runScan = () => {
    signal.current.stop = true;
    const s = { stop: false };
    signal.current = s;
    setFound([]);
    setScanning(true);
    scan((p) => setFound((x) => (x.some((y) => y.ip === p.ip) ? x : [...x, p])), s).finally(() => { if (!s.stop) setScanning(false); });
  };
  useEffect(() => { runScan(); return () => { signal.current.stop = true; }; }, []);
  // Un seul PC trouvé : on passe directement au code
  useEffect(() => { if (!pc && found.length === 1) setPc(found[0]); }, [found, pc]);

  const send = async (full: string) => {
    if (!pc) return;
    setState({ busy: true });
    const r = await window.nocta!.http(`http://${pc.ip}:${PORT}/transfer?code=${full}`, { timeout: 15000 });
    if (r.status === 403) { setCode(''); return setState({ error: 'Code incorrect, réessaie.' }); }
    const d = (r.data as { version?: number; data?: any })?.data;
    if (!r.ok || !d || d.version !== 1 || !Array.isArray(d.profiles)) { setCode(''); return setState({ error: 'Le PC ne répond pas. Vérifie que le partage est toujours lancé.' }); }
    const st = useStore.getState();
    useStore.setState({
      profiles: d.profiles,
      addons: Array.isArray(d.addons) && d.addons.length ? d.addons : st.addons,
      // Réglages du PC, sauf ceux propres à la TV (lecteur natif)
      settings: { ...st.settings, ...(d.settings || {}), playerEngine: 'mpv' },
      introMarks: d.introMarks || st.introMarks,
      activeProfileId: null,
    });
    setState({ ok: true });
    setTimeout(onClose, 1800);
  };

  const press = (k: string) => {
    if (state.busy) return;
    setState({});
    if (k === 'del') return setCode((c) => c.slice(0, -1));
    const next = (code + k).slice(0, 4);
    setCode(next);
    if (next.length === 4) send(next);
  };

  // Chiffres du clavier (télécommande avec pavé numérique)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pc) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <motion.div className="tvx-back" data-nav-scope initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="tvx" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <button className="tvx-close" onClick={onClose} data-nav-back aria-label="Fermer"><X size={22} /></button>
        <span className="tvx-kicker">Importer depuis mon PC</span>

        {state.ok ? (
          <div className="tvx-done"><Check size={56} /><h2>C'est fait !</h2><p>Tes profils, ton journal, tes addons et tes réglages sont sur la TV.</p></div>
        ) : !pc ? (
          <>
            <h2>Sur ton PC : Paramètres → <em>Envoyer vers la TV</em></h2>
            <p className="tvx-lead">NOCTA cherche ton PC sur le réseau de la maison…</p>
            <div className="tvx-pcs">
              {found.map((p) => (
                <button key={p.ip} className="tvx-pc" onClick={() => setPc(p)} data-nav-default>
                  <Laptop size={28} /><strong>{p.name}</strong><span>{p.ip}</span>
                </button>
              ))}
              {scanning && <div className="tvx-searching"><Loader2 size={22} className="spin" /> Recherche…</div>}
              {!scanning && !found.length && (
                <div className="tvx-none">
                  <MonitorSmartphone size={28} />
                  <p>Aucun PC trouvé. Lance « Envoyer vers la TV » sur le PC (même Wi-Fi que la TV), puis réessaie.</p>
                  <button className="btn btn-white" onClick={runScan} data-nav-default><RefreshCw size={18} /> Chercher de nouveau</button>
                  <div className="tvx-manual">
                    <input className="input" placeholder="ou l'adresse du PC (ex. 192.168.1.20)" value={manual} onChange={(e) => setManual(e.target.value.trim())} />
                    <button className="btn-outline" disabled={!/^\d+\.\d+\.\d+\.\d+$/.test(manual)} onClick={() => setPc({ ip: manual, name: manual })}>OK</button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <h2>Tape le code affiché sur <em>{pc.name}</em></h2>
            <div className="tvx-code tvx-code-input">
              {[0, 1, 2, 3].map((i) => <span key={i} className={code[i] ? 'is-on' : ''}>{code[i] || ''}</span>)}
            </div>
            {state.error && <div className="status err">{state.error}</div>}
            {state.busy && <div className="tvx-searching"><Loader2 size={22} className="spin" /> Copie en cours…</div>}
            <div className="tvx-pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => <button key={k} onClick={() => press(k)} data-nav-default={k === '5' || undefined}>{k}</button>)}
              <button onClick={() => { setPc(null); setCode(''); setState({}); }} className="tvx-pad-small">Autre PC</button>
              <button onClick={() => press('0')}>0</button>
              <button onClick={() => press('del')} aria-label="Effacer"><Delete size={26} /></button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
