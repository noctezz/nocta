import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, ExternalLink, Loader2, Play, Puzzle, X, Zap } from 'lucide-react';
import { getStreams, streamQuality, streamSize, type StreamGroup } from '../lib/addons';
import { useLatest } from '../lib/useLatest';
import { rankStreams } from '../lib/autoplay';
import { useStore } from '../lib/store';
import { errMsg, resolveStream, streamToDesc } from '../lib/playback';
import { backdropOf, posterOf, useBusy } from '../lib/ui';
import type { Stream } from '../lib/types';
import { cachedLang, canCheck, checkLang, discard, fitsVerified, isChecking, onLangResult } from '../lib/langCheck';
import { filterSources } from '../lib/sourcePolicy';
import { langPrefsFor } from '../lib/langPrefs';

interface Row { stream: Stream; addon: string; key: string }

/** Résultat de la vérification de langue d'une source */
function LangTag({ stream, want }: { stream: Stream; want: 'vf' | 'vo' | null }) {
  const info = cachedLang(stream);
  if (info && want === 'vo') {
    const fits = fitsVerified(info, 'vo');
    const text = fits === true ? `VO vérifiée${info.voLabel ? ` · ${info.voLabel}` : ''}` : fits === false ? 'VF seule, pas de VO' : info.label;
    return (
      <span className={`tag ${fits === true ? 'tag-lang-ok' : fits === false ? 'tag-lang-bad' : 'tag-dim'}`} title="Langue lue dans le fichier, pas dans le nom du torrent">
        <AudioLines size={11} /> {text}
      </span>
    );
  }
  if (info) {
    const cls = info.status === 'fr' ? 'tag-lang-ok' : info.status === 'nofr' ? 'tag-lang-bad' : 'tag-dim';
    return (
      <>
        <span className={`tag ${cls}`} title="Langue lue dans le fichier, pas dans le nom du torrent">
          {info.status === 'fr' ? '🇫🇷 ' : <AudioLines size={11} />} {info.label}
        </span>
        {info.status !== 'fr' && info.frSubs && <span className="tag">Sous-titres FR</span>}
      </>
    );
  }
  if (isChecking(stream)) return <span className="tag tag-dim"><Loader2 size={11} className="spin" /> Vérif. {want === 'vo' ? 'VO' : 'VF'}…</span>;
  return null;
}

export function StreamPicker() {
  const picker = useLatest(useStore((s) => s.picker))!;
  const close = useStore((s) => s.closePicker);
  const addons = useStore((s) => s.addons);
  const play = useStore((s) => s.play);
  const setPage = useStore((s) => s.setPage);
  const closeDetail = useStore((s) => s.closeDetail);
  const [groups, setGroups] = useState<StreamGroup[] | null>(null);
  const [busy, setBusy] = useState<{ key: string; text: string } | null>(null);
  const [signal] = useState(() => ({ cancelled: false }));
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => () => { signal.cancelled = true; }, [signal]);

  useEffect(() => {
    let alive = true;
    getStreams(addons, picker.type, picker.videoId).then((g) => { if (alive) setGroups(g); });
    return () => { alive = false; };
  }, [addons, picker.type, picker.videoId]);

  // Vérification de la vraie langue des meilleures sources : la liste se réordonne au fil des résultats
  useStore((s) => s.settings);
  useStore((s) => s.profiles);
  const { verify, want } = langPrefsFor(picker.meta.id);
  const [langVersion, setLangVersion] = useState(0);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => onLangResult(() => setLangVersion((v) => v + 1)), []);

  // Sans 4K / HDR, seulement la langue voulue (les fausses VF disparaissent une fois démasquées)
  const { rows, hidden, relaxed } = useMemo(() => {
    if (!groups) return { rows: [] as Row[], hidden: 0, relaxed: false };
    const all = groups.flatMap((g) => g.streams.map((s, i) => ({ stream: s, addon: g.addon.manifest.name, key: `${g.addon.url}#${i}` })));
    const f = filterSources(all, picker.meta.id, { showAll });
    // Même classement que la lecture automatique : la 1re source est celle qu'elle choisirait
    return { rows: rankStreams(f.kept, picker.meta.id), hidden: f.hiddenUhd + f.hiddenLang, relaxed: f.langRelaxed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, langVersion, verify, want, showAll]);

  useEffect(() => {
    if (!verify || !want || !groups) return;
    // Une par une, dans l'ordre, jusqu'à la première confirmée (une seule source ajoutée à TorBox)
    let stop = false;
    const all = groups.flatMap((g) => g.streams.map((stream) => ({ stream })));
    const ranked = rankStreams(filterSources(all, picker.meta.id).kept, picker.meta.id).map((r) => r.stream);
    (async () => {
      for (const s of ranked.filter(canCheck).slice(0, 8)) {
        if (stop) break;
        const run = checkLang(s);
        setLangVersion((v) => v + 1);
        const fits = fitsVerified(await run, want);
        if (fits === false) discard(s); // mauvaise langue : retirée de TorBox tout de suite
        if (fits === true) break;
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verify, want, groups]);


  const qualities = useMemo(() => {
    const set = new Set(rows.map((r) => streamQuality(r.stream).label).filter(Boolean));
    return ['all', ...['4K', '1440p', '1080p', '720p', '480p'].filter((q) => set.has(q))];
  }, [rows]);

  const poster = posterOf(picker.meta);
  const shown = filter === 'all' ? rows : rows.filter((r) => streamQuality(r.stream).label === filter);
  const noStreamAddon = groups && groups.length === 0;

  const choose = async (r: Row) => {
    const s = r.stream;
    if (s.externalUrl || s.ytId) {
      window.nocta?.openExternal(s.externalUrl || `https://www.youtube.com/watch?v=${s.ytId}`);
      return;
    }
    const desc = streamToDesc(s);
    // Écran de chargement plein écran (visuel du titre + épisode) jusqu'au lancement
    const loading = useBusy.getState();
    const local = { cancelled: false };
    const base = { meta: picker.meta, title: picker.meta.name, subtitle: picker.episodeTitle };
    setBusy({ key: r.key, text: '' });
    loading.set({ ...base, status: 'Préparation de la lecture…' }, local);
    try {
      const src = await resolveStream(desc, { season: picker.season, episode: picker.episode }, undefined, local);
      if (local.cancelled || signal.cancelled) return;
      loading.set({ ...base, status: 'Lancement du lecteur…' });
      closeDetail();
      play({
        src,
        title: picker.meta.name,
        subtitle: picker.episodeTitle,
        meta: picker.meta,
        type: picker.type,
        videoId: picker.videoId,
        season: picker.season,
        episode: picker.episode,
        stream: desc,
      });
    } catch (e) {
      if (!local.cancelled && !signal.cancelled) useStore.getState().toast(errMsg(e), 'error');
      loading.set(null, null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      className="modal-backdrop picker-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <motion.div
        className="picker"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <div className="picker-head" style={{ backgroundImage: `url(${backdropOf(picker.meta)})` }}>
          <div className="picker-head-fade" />
          <button className="round" data-nav-back onClick={close} aria-label="Fermer"><X size={20} /></button>
          <div>
            <small>Choisis une source</small>
            <h2>{picker.meta.name}</h2>
            {picker.episodeTitle && <p>{picker.episodeTitle}</p>}
          </div>
        </div>

        {qualities.length > 2 && (
          <div className="chips">
            {qualities.map((q) => (
              <button key={q} className={filter === q ? 'is-on' : ''} onClick={() => setFilter(q)}>
                {q === 'all' ? 'Toutes' : q}
              </button>
            ))}
          </div>
        )}

        {groups && (hidden > 0 || relaxed || showAll) && (
          <div className="picker-filter">
            <span>
              {showAll
                ? 'Toutes les sources'
                : relaxed
                  ? `Aucune source ${want === 'vo' ? 'en VO' : 'en VF'} trouvée : toutes les langues sont affichées`
                  : `${want === 'vo' ? 'VO' : want === 'vf' ? 'VF' : 'Sources'}${useStore.getState().settings.hideUhd !== false ? ' · sans 4K ni HDR' : ''} · ${hidden} masquée${hidden > 1 ? 's' : ''}`}
            </span>
            <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Filtrer' : 'Tout afficher'}</button>
          </div>
        )}

        <div className="picker-list">
          {!groups && Array.from({ length: 6 }, (_, i) => <div key={i} className="stream skeleton" />)}

          {noStreamAddon && (
            <div className="empty">
              <Puzzle size={40} />
              <h3>Aucun addon de sources installé</h3>
              <p>Installe un addon de sources (par exemple Comet configuré avec ton débrideur) pour lancer la lecture.</p>
              <button className="btn btn-white" onClick={() => { close(); closeDetail(); setPage('addons'); }}>Gérer les addons</button>
            </div>
          )}

          {groups && !noStreamAddon && rows.length === 0 && (
            <div className="empty">
              <h3>Aucune source trouvée</h3>
              <p>Aucun addon n'a renvoyé de flux pour ce titre.</p>
              {groups.filter((g) => g.error).map((g) => <small key={g.addon.url}>{g.addon.manifest.name} : {g.error}</small>)}
            </div>
          )}

          {shown.map((r, i) => {
            const s = r.stream;
            const q = streamQuality(s);
            const size = streamSize(s);
            const isCached = !!s.url && /⚡|\+\]|cached|instant/i.test(`${s.name} ${s.title}`);
            const lines = (s.title || s.description || '').split('\n').filter(Boolean);
            const isBusy = busy?.key === r.key;
            return (
              <motion.button
                key={r.key}
                layout="position"
                className={`stream ${isBusy ? 'is-busy' : ''}`}
                onClick={() => !busy && choose(r)}
                disabled={!!busy && !isBusy}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <div className="stream-poster">
                  {poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : <div className="card-fallback" />}
                  {q.label && <span className={`stream-res q-${q.res}`}>{q.label}</span>}
                </div>
                <div className="stream-info">
                  <div className="stream-name">
                    {(s.name || r.addon).split('\n').join(' · ')}
                  </div>
                  <div className="stream-title">{lines.slice(0, 2).join(' — ') || r.addon}</div>
                  <div className="stream-tags">
                    {verify && <LangTag stream={s} want={want} />}
                    {isCached && <span className="tag tag-green"><Zap size={11} /> Instantané</span>}
                    {q.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    {size && <span className="tag">{size}</span>}
                    <span className="tag tag-dim">{r.addon}</span>
                  </div>
                </div>
                <div className="stream-go">
                  {isBusy ? <Loader2 className="spin" size={22} /> : s.externalUrl || s.ytId ? <ExternalLink size={20} /> : <Play size={20} fill="currentColor" />}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
