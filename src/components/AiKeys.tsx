import { useState } from 'react';
import { ArrowUp, Trash2 } from 'lucide-react';
import { detectProvider, aiKeys, PROVIDERS, type AiKey, type AiProvider } from '../lib/aiKeys';
import { useStore } from '../lib/store';

const ORDER = Object.keys(PROVIDERS) as AiProvider[];

/** Ajout d'une clé : choix du service (deviné en collant la clé), lien pour la créer, test réel */
export function AiKeyAdder({ onAdd, compact = false }: { onAdd: (k: AiKey) => void; compact?: boolean }) {
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [key, setKey] = useState('');
  const [state, setState] = useState<{ busy?: boolean; ok?: string; error?: string }>({});
  const info = PROVIDERS[provider];

  const onKey = (v: string) => {
    setKey(v);
    const p = detectProvider(v);
    if (p) setProvider(p);
  };
  const add = async () => {
    const k = key.trim();
    if (!k || !window.nocta) return;
    setState({ busy: true });
    const r = await window.nocta.assistant.testKey({ provider, key: k });
    if (r.ok || r.keyOk) {
      onAdd({ provider, key: k });
      setKey('');
      setState({ ok: r.ok ? `${info.name} ajouté : ${r.model} répond en ${fmt(r.ms)}` : `${info.name} ajouté (le service est saturé en ce moment, il sera réessayé plus tard)` });
    } else setState({ error: r.error || 'Clé refusée' });
  };

  return (
    <div className={`ai-adder ${compact ? 'compact' : ''}`}>
      <div className="ai-providers">
        {ORDER.map((p) => (
          <button key={p} className={p === provider ? 'on' : ''} onClick={() => setProvider(p)}>{PROVIDERS[p].name}</button>
        ))}
      </div>
      <p className="ai-provider-hint">
        {info.hint}{' '}
        <a onClick={() => window.nocta?.openExternal(info.url)}>Créer ma clé {info.name.split(' ')[0]} ↗</a>
      </p>
      <div className="key-row">
        <input className="input" type="password" placeholder={info.placeholder} value={key} onChange={(e) => onKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-outline" disabled={state.busy || !key.trim()} onClick={add}>{state.busy ? 'Test…' : 'Ajouter'}</button>
      </div>
      {state.ok && <div className="status ok">{state.ok}</div>}
      {state.error && <div className="status err">{state.error}</div>}
    </div>
  );
}

const fmt = (ms?: number) => `${((ms || 0) / 1000).toFixed(1).replace('.', ',')} s`;

/** Clés enregistrées, dans l'ordre d'essai : quand l'une est saturée ou à court de quota, on passe à la suivante */
export function AiKeyList() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const keys = aiKeys(settings);
  const [tests, setTests] = useState<Record<string, { busy?: boolean; ok?: boolean; warn?: boolean; text?: string }>>({});
  const save = (next: AiKey[]) => update({ noxKeys: next, noxKey: undefined });

  const test = async (k: AiKey) => {
    setTests((t) => ({ ...t, [k.key]: { busy: true } }));
    const r = await window.nocta!.assistant.testKey(k);
    setTests((t) => ({ ...t, [k.key]: r.ok ? { ok: true, text: `${r.model} · ${fmt(r.ms)}` } : r.keyOk ? { warn: true, text: 'Clé valide, mais le service est saturé en ce moment' } : { ok: false, text: r.error } }));
  };
  const move = (i: number) => { const n = [...keys]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; save(n); };

  return (
    <div className="ai-keys">
      {keys.length > 0 && (
        <ol className="ai-key-list">
          {keys.map((k, i) => {
            const t = tests[k.key];
            return (
              <li key={k.key}>
                <span className="ai-key-rank">{i + 1}</span>
                <div className="ai-key-main">
                  <strong>{PROVIDERS[k.provider]?.name || k.provider}</strong>
                  <span className="ai-key-mask">••••{k.key.slice(-4)}</span>
                  {t?.text && <span className={`ai-key-test ${t.ok ? 'ok' : t.warn ? 'warn' : 'err'}`}>{t.text}</span>}
                </div>
                <button className="btn-outline btn-sm" disabled={t?.busy} onClick={() => test(k)}>{t?.busy ? 'Test…' : 'Tester'}</button>
                <button className="ai-icon" disabled={i === 0} onClick={() => move(i)} title="Essayer en premier"><ArrowUp size={15} /></button>
                <button className="ai-icon" onClick={() => save(keys.filter((x) => x !== k))} title="Supprimer"><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ol>
      )}
      {keys.length > 0 && <strong className="ai-add-title">Ajouter une clé</strong>}
      <AiKeyAdder onAdd={(k) => save([...keys.filter((x) => x.key !== k.key), k])} />
    </div>
  );
}
