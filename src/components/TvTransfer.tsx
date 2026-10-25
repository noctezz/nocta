import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Laptop, Loader2, RefreshCw, Tv, X } from 'lucide-react';
import { useStore } from '../lib/store';

// ---------------------------------------------------------------- PC : « Envoyer vers la TV »

interface FoundTv { ip: string; name: string }

/** Paramètres du PC : envoie les profils, addons et réglages à l'appli de la TV */
export function SendToTv() {
  const t = window.nocta?.transfer;
  const [open, setOpen] = useState(false);
  const [tvs, setTvs] = useState<FoundTv[]>([]);
  const [scanning, setScanning] = useState(false);
  const [tv, setTv] = useState<FoundTv | null>(null);
  const [code, setCode] = useState('');
  const [manual, setManual] = useState('');
  const [state, setState] = useState<{ busy?: boolean; error?: string; ok?: boolean }>({});

  const runScan = () => {
    if (!t) return;
    setTvs([]);
    setScanning(true);
    t.scan().then((r) => { if (r.done) setScanning(false); });
  };
  useEffect(() => t?.onFound((x) => setTvs((l) => (l.some((y) => y.ip === x.ip) ? l : [...l, x]))), [t]);
  useEffect(() => () => { t?.stopScan(); }, [t]);
  // Une seule TV trouvée : on passe directement au code
  useEffect(() => { if (open && !tv && tvs.length === 1) setTv(tvs[0]); }, [tvs, tv, open]);
  if (!t) return null;

  const begin = () => { setOpen(true); setTv(null); setCode(''); setState({}); runScan(); };
  const close = () => { t.stopScan(); setOpen(false); setTv(null); setCode(''); setState({}); };

  const send = async (full: string) => {
    if (!tv) return;
    setState({ busy: true });
    const r = await t.send(tv.ip, full);
    if (r.ok) { t.stopScan(); setScanning(false); return setState({ ok: true }); }
    setCode('');
    setState({ error: r.error === 'code' ? 'Code incorrect : tape celui affiché sur la TV.'
      : 'La TV ne répond pas. Vérifie que l\'écran « Importer depuis mon PC » est toujours ouvert sur la TV.' });
  };

  return (
    <div className="tvx-send">
      <div className="tvx-send-head">
        <Tv size={30} />
        <div>
          <strong>Envoyer vers la TV</strong>
          <span>Profils, journal, addons, clé TorBox et réglages : copiés sur l'appli NOCTA de ta TV (Bbox, TV Android), sans rien retaper.</span>
        </div>
        {!open && <button className="btn btn-white" onClick={begin}>Envoyer vers la TV</button>}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="tvx-code-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {state.ok ? (
              <div className="status ok">Envoyé à la TV ✓ Tes profils apparaissent maintenant sur la TV.</div>
            ) : !tv ? (
              <>
                <ol>
                  <li>Sur la TV, ouvre NOCTA puis <strong>Importer depuis mon PC</strong>.</li>
                  <li>Choisis ta TV ci-dessous.</li>
                </ol>
                <div className="tvx-pcs tvx-pcs-pc">
                  {tvs.map((x) => (
                    <button key={x.ip} className="tvx-pc" onClick={() => setTv(x)}>
                      <Tv size={24} /><strong>{x.name}</strong><span>{x.ip}</span>
                    </button>
                  ))}
                  {scanning && <div className="tvx-searching"><Loader2 size={20} className="spin" /> Recherche de la TV…</div>}
                  {!scanning && !tvs.length && (
                    <div className="tvx-none">
                      <p>Aucune TV trouvée. Ouvre « Importer depuis mon PC » sur la TV, puis relance la recherche.</p>
                      <button className="btn btn-white" onClick={runScan}><RefreshCw size={16} /> Chercher de nouveau</button>
                    </div>
                  )}
                </div>
                <div className="tvx-manual">
                  <input className="input" placeholder="ou l'adresse affichée sur la TV (ex. 192.168.1.30)" value={manual} onChange={(e) => setManual(e.target.value.trim())} />
                  <button className="btn-outline" disabled={!/^\d+\.\d+\.\d+\.\d+$/.test(manual)} onClick={() => setTv({ ip: manual, name: manual })}>OK</button>
                </div>
              </>
            ) : (
              <>
                <p className="tvx-ask">Tape le code affiché sur <strong>{tv.name}</strong> :</p>
                <input
                  className="input tvx-code-field" autoFocus inputMode="numeric" maxLength={4} placeholder="····"
                  value={code} disabled={state.busy}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCode(v);
                    setState({});
                    if (v.length === 4) send(v);
                  }}
                />
                {state.busy && <div className="tvx-searching"><Loader2 size={20} className="spin" /> Envoi en cours…</div>}
                {state.error && <div className="status err">{state.error}</div>}
                <button className="btn-link" onClick={() => { setTv(null); setCode(''); setState({}); if (!tvs.length) runScan(); }}>Autre TV</button>
              </>
            )}
            <button className="btn-link" onClick={close}>{state.ok ? 'Fermer' : 'Annuler'}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- TV : « Importer depuis mon PC »

const newCode = () => String(1000 + Math.floor(Math.random() * 9000));

export function ImportFromPc({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(newCode);
  const [info, setInfo] = useState<{ ip: string; name?: string; error?: string } | null>(null);
  const [state, setState] = useState<{ error?: string; ok?: boolean }>({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const tv = window.nocta?.tv;
    if (!tv?.receive) return;
    let stop = () => {};
    let alive = true;
    const apply = (raw?: string) => {
      let d: any = null;
      try { d = JSON.parse(raw || '')?.data; } catch { /* données illisibles */ }
      if (!d || d.version !== 1 || !Array.isArray(d.profiles)) return setState({ error: 'Les données reçues sont illisibles. Réessaie depuis le PC.' });
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
      setTimeout(() => closeRef.current(), 2200);
    };
    Promise.all([tv.localIp(), tv.receive(code, (r) => {
      if (!alive) return;
      if (r.error !== 'tries') return apply(r.data);
      setState({ error: 'Trop de codes faux : un nouveau code a été créé.' });
      setCode(newCode());
    })]).then(([ip, r]) => {
      stop = r.stop;
      if (!alive) return r.stop();
      setInfo({ ip, name: r.name, error: r.ok ? undefined : r.error });
    });
    return () => { alive = false; stop(); };
  }, [code]);

  return (
    <motion.div className="tvx-back" data-nav-scope initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="tvx" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <button className="tvx-close" onClick={onClose} data-nav-back data-nav-default aria-label="Fermer"><X size={22} /></button>
        <span className="tvx-kicker">Importer depuis mon PC</span>

        {state.ok ? (
          <div className="tvx-done"><Check size={56} /><h2>C'est fait !</h2><p>Tes profils, ton journal, tes addons et tes réglages sont sur la TV.</p></div>
        ) : (
          <>
            <h2>Sur ton PC : Paramètres → <em>Envoyer vers la TV</em></h2>
            <p className="tvx-lead">Choisis cette TV sur le PC, puis tape ce code :</p>
            <div className="tvx-code">{code.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            {info?.error ? (
              <div className="status err">La TV ne peut pas recevoir pour le moment ({info.error}).</div>
            ) : (
              <div className="tvx-searching"><Loader2 size={22} className="spin" /> En attente du PC…</div>
            )}
            {state.error && <div className="status err">{state.error}</div>}
            {info?.ip && <p className="tvx-lead tvx-small"><Laptop size={16} /> Si le PC ne trouve pas la TV, tape son adresse : <strong>{info.ip}</strong></p>}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
