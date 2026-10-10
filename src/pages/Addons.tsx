import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Check, Compass, Globe, Loader2, Plus, Puzzle, RefreshCw, Search, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { configureUrlOf, getAddonCatalog, installAddon, type AddonCategory, type CatalogAddon } from '../lib/addons';
import { useStore } from '../lib/store';
import { errMsg } from '../lib/playback';
import type { ResourceDef } from '../lib/types';

const resName = (r: ResourceDef) => (typeof r === 'string' ? r : r.name);
const RES_FR: Record<string, string> = { catalog: 'Catalogue', meta: 'Métadonnées', stream: 'Sources', subtitles: 'Sous-titres', addon_catalog: 'Addons' };

const CATEGORIES: { id: AddonCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'stream', label: 'Sources' },
  { id: 'catalog', label: 'Catalogues' },
  { id: 'meta', label: 'Métadonnées' },
  { id: 'subtitles', label: 'Sous-titres' },
  { id: 'other', label: 'Autres' },
];

function AddonLogo({ src }: { src?: string }) {
  const [ok, setOk] = useState(true);
  return (
    <div className="addon-logo">
      {src && ok ? <img src={src} alt="" onError={() => setOk(false)} /> : <Puzzle size={26} />}
    </div>
  );
}

export function Addons() {
  const addons = useStore((s) => s.addons);
  const setAddons = useStore((s) => s.setAddons);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const install = async (raw: string) => {
    if (!raw.trim()) return;
    setBusy(raw);
    try {
      const { manifest, updated } = await installAddon(raw);
      setUrl('');
      toast(`${manifest.name} ${updated ? 'mis à jour' : 'installé'} ✓`, 'success');
    } catch (e) {
      toast(`Installation impossible : ${errMsg(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = (u: string) => setAddons(addons.filter((a) => a.url !== u));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= addons.length) return;
    const next = addons.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setAddons(next);
  };

  return (
    <div className="page page-padded narrow">
      <div className="title-row">
        <h1 className="page-title">Addons</h1>
        <div className="tabs">
          <button className={tab === 'mine' ? 'is-on' : ''} onClick={() => setTab('mine')}><Puzzle size={16} /> Mes addons</button>
          <button className={tab === 'discover' ? 'is-on' : ''} onClick={() => setTab('discover')}><Compass size={16} /> Découvrir</button>
        </div>
      </div>

      {tab === 'mine' ? (
        <>
          <p className="lead">
            Le même système d'addons que Stremio : colle l'URL d'un <code>manifest.json</code>, ou va dans
            <a onClick={() => setTab('discover')}> Découvrir</a> pour installer en un clic.
          </p>
          <div className="install-box">
            <Puzzle size={22} />
            <input
              className="input"
              placeholder="https://…/manifest.json  ou  stremio://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && install(url)}
            />
            <button className="btn btn-red" onClick={() => install(url)} disabled={!!busy}>
              {busy === url && busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} Installer
            </button>
          </div>

          <div className="addon-list">
            <AnimatePresence initial={false}>
              {addons.map((a, i) => {
                const configurable = (a.manifest as any).behaviorHints?.configurable;
                return (
                  <motion.div
                    key={a.url}
                    className="addon"
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -30 }}
                  >
                    <AddonLogo src={a.manifest.logo} />
                    <div className="addon-info">
                      <div className="addon-name">{a.manifest.name} <small>v{a.manifest.version}</small></div>
                      {a.manifest.description && <p>{a.manifest.description}</p>}
                      <div className="stream-tags">
                        {(a.manifest.resources || []).map((r) => <span key={resName(r)} className="tag">{RES_FR[resName(r)] || resName(r)}</span>)}
                        {(a.manifest.types || []).map((t) => <span key={t} className="tag tag-dim">{t}</span>)}
                      </div>
                    </div>
                    <div className="addon-actions">
                      <button className="icon-btn" title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button className="icon-btn" title="Descendre" onClick={() => move(i, 1)} disabled={i === addons.length - 1}>↓</button>
                      {configurable && (
                        <button className="icon-btn" title="Configurer" onClick={() => window.nocta?.addons.openWindow(configureUrlOf(a.url))}><Settings2 size={16} /></button>
                      )}
                      <button className="icon-btn" title="Actualiser" onClick={() => install(a.url)}><RefreshCw size={16} /></button>
                      <button className="icon-btn danger" title="Supprimer" onClick={() => remove(a.url)}><Trash2 size={16} /></button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <Discover install={install} busy={busy} />
      )}
    </div>
  );
}

function Discover({ install, busy }: { install: (url: string) => void; busy: string | null }) {
  const addons = useStore((s) => s.addons);
  const [list, setList] = useState<CatalogAddon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<AddonCategory | 'all'>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    getAddonCatalog(addons)
      .then((l) => { if (alive) setList(l); })
      .catch((e) => { if (alive) { setError(errMsg(e)); setList([]); } });
    return () => { alive = false; };
    // Le catalogue ne dépend pas de l'ordre des addons installés
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const installedIds = useMemo(() => new Set(addons.map((a) => a.manifest.id)), [addons]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list?.length || 0 };
    for (const a of list || []) c[a.category] = (c[a.category] || 0) + 1;
    return c;
  }, [list]);

  const shown = (list || []).filter((a) => {
    if (cat !== 'all' && a.category !== cat) return false;
    if (!q.trim()) return true;
    const t = `${a.manifest.name} ${a.manifest.description || ''}`.toLowerCase();
    return t.includes(q.trim().toLowerCase());
  });

  return (
    <>
      <p className="lead">
        Le catalogue officiel de Stremio : addons <strong>officiels</strong> et addons communautaires <strong>vérifiés</strong>, sans doublons.
        <strong> Configurer</strong> ouvre la page de l'addon : son bouton « Install » l'ajoute directement à NOCTA.
      </p>

      <div className="discover-bar">
        <div className="discover-search">
          <Search size={18} />
          <input placeholder="Rechercher un addon…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-outline" onClick={() => window.nocta?.addons.openWindow('https://stremio-addons.net/')}>
          <Globe size={16} /> stremio-addons.net
        </button>
      </div>

      <div className="chips discover-chips">
        {CATEGORIES.filter((c) => c.id === 'all' || counts[c.id]).map((c) => (
          <button key={c.id} className={cat === c.id ? 'is-on' : ''} onClick={() => setCat(c.id)}>
            {c.label} <span>{counts[c.id] || 0}</span>
          </button>
        ))}
      </div>

      {list === null && <div className="lib-loading"><Loader2 className="spin" size={28} /></div>}
      {error && <p className="status err">{error}</p>}
      {list && list.length === 0 && !error && (
        <div className="empty big">
          <h3>Catalogue indisponible</h3>
          <p>Impossible de joindre le catalogue Stremio. Tu peux parcourir stremio-addons.net avec le bouton ci-dessus.</p>
        </div>
      )}

      <div className="discover-grid">
        {shown.map((a, i) => {
          const installed = installedIds.has(a.manifest.id);
          const hints = a.manifest.behaviorHints || {};
          const needsConfig = !!hints.configurationRequired;
          const configurable = !!hints.configurable || needsConfig;
          return (
            <motion.div
              key={a.manifest.id}
              className="discover-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.3) }}
            >
              <div className="discover-top">
                <AddonLogo src={a.manifest.logo} />
                <div className="addon-info">
                  <div className="addon-name">
                    {a.manifest.name}
                    {a.official
                      ? <span className="badge-verified official" title="Addon officiel Stremio"><ShieldCheck size={13} /> Officiel</span>
                      : <span className="badge-verified" title="Vérifié par Stremio"><BadgeCheck size={13} /> Vérifié</span>}
                  </div>
                  <small className="muted">v{a.manifest.version}</small>
                </div>
              </div>
              {a.manifest.description && <p className="discover-desc">{a.manifest.description}</p>}
              <div className="stream-tags">
                {(a.manifest.resources || []).map((r) => <span key={resName(r)} className="tag">{RES_FR[resName(r)] || resName(r)}</span>)}
                {(a.manifest.types || []).slice(0, 4).map((t) => <span key={t} className="tag tag-dim">{t}</span>)}
              </div>
              <div className="discover-actions">
                {installed ? (
                  <span className="installed"><Check size={16} /> Installé</span>
                ) : !needsConfig ? (
                  <button className="btn btn-white" disabled={!!busy} onClick={() => install(a.url)}>
                    {busy === a.url ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Installer
                  </button>
                ) : null}
                {configurable && (
                  <button className="btn btn-glass" onClick={() => window.nocta?.addons.openWindow(configureUrlOf(a.url))}>
                    <Settings2 size={16} /> Configurer
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
