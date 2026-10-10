import { useEffect, useRef } from 'react';
import { getMeta, getSubtitles } from '../lib/addons';
import { useStore } from '../lib/store';
import { useLatest } from '../lib/useLatest';
import { detectIntro } from '../lib/autoplay';
import { episodeTitleOf, errMsg, nextEpisode, recordProgress, resolveNextEpisode, slimMeta } from '../lib/playback';
import type { Meta, PlayRequest } from '../lib/types';

/**
 * Pilote le lecteur mpv depuis la fenêtre principale : ouverture, sous-titres des
 * addons, sauvegarde de la progression, épisode suivant et fermeture.
 * L'affichage, lui, se fait dans la fenêtre transparente au-dessus de mpv.
 */
export function MpvBridge() {
  const initial = useLatest(useStore((s) => s.player))!;
  const reqRef = useRef<PlayRequest>(initial);
  const stateRef = useRef({ time: 0, duration: 0 });
  const metaRef = useRef<Meta | null>(null);
  const busyRef = useRef(false);
  const openedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    const p = window.nocta!.player;
    const st = useStore.getState;
    aliveRef.current = true;
    const alive = () => aliveRef.current;
    let lastSave = 0;

    const payload = (r: PlayRequest) => ({
      src: r.src,
      title: r.title,
      subtitle: r.subtitle,
      meta: r.meta,
      startAt: r.startAt,
      volume: st().settings.volume,
      subtitleSize: st().settings.subtitleSize,
      alang: st().settings.preferredSubLang === 'eng' ? 'eng,en' : `${st().settings.preferredSubLang},fre,fra,fr,eng,en`,
    });

    // Infos annexes envoyées à l'interface du lecteur : sous-titres, épisode suivant
    const sendExtras = async (r: PlayRequest) => {
      const settings = st().settings;
      p.info({
        autoplayNext: settings.autoplayNext,
        autoSkipIntro: settings.autoSkipIntro,
        // Générique de cet épisode (détecté) sinon celui appris pour la série
        intro: r.type === 'series' && r.meta ? st().introMarks?.[r.videoId || ''] || st().introMarks?.[r.meta.id] || null : null,
        next: null,
        extSubs: [],
      });
      if (r.type && r.videoId) {
        getSubtitles(st().addons, r.type, r.videoId).then((extSubs) => { if (alive()) p.info({ extSubs }); }).catch(() => {});
      }
      if (r.type === 'series' && r.meta) {
        const meta = metaRef.current?.id === r.meta.id ? metaRef.current : await getMeta(st().addons, 'series', r.meta.id).catch(() => null);
        metaRef.current = meta;
        const nx = meta && r.videoId ? nextEpisode(meta, r.videoId) : null;
        if (alive()) p.info({ next: nx ? { label: episodeTitleOf(nx) } : null });
        // Analyse audio du générique, une fois la lecture bien lancée
        setTimeout(() => {
          if (!alive() || reqRef.current.videoId !== r.videoId) return;
          detectIntro(r, meta, (mark) => {
            if (alive() && reqRef.current.videoId === r.videoId) p.info({ intro: mark });
          }).catch(() => {});
        }, 12000);
      }
    };

    const fallback = (why?: string) => {
      if (why) st().toast(`Lecteur intégré indisponible (${why}) : lecteur de secours utilisé`, 'error');
      useStore.setState({ player: { ...reqRef.current, engine: 'web' } });
    };

    const nextOf = () => (metaRef.current && reqRef.current.videoId ? nextEpisode(metaRef.current, reqRef.current.videoId) : null);

    const offs = [
      // Générique repéré dans le lecteur (saut manuel) : mémorisé pour toute la série
      p.on('player:intro', (mark: { start: number; end: number } | null) => {
        const r = reqRef.current;
        if (r.type === 'series' && r.meta) {
          st().setIntroMark(r.meta.id, mark);
          if (r.videoId) st().setIntroMark(r.videoId, mark);
        }
      }),
      p.on('player:state', (s: { time: number; duration: number }) => {
        stateRef.current = s;
        if (Date.now() - lastSave > 5000) {
          lastSave = Date.now();
          recordProgress(reqRef.current, s.time, s.duration, nextOf());
        }
      }),
      p.on('player:closed', (s: { time: number; duration: number; error?: string }) => {
        if (s.duration) recordProgress(reqRef.current, s.time, s.duration, nextOf());
        if (s.error && !s.time) return fallback(s.error);
        if (s.error) st().toast(s.error, 'error');
        st().closePlayer();
      }),
      p.on('player:next', async () => {
        if (busyRef.current) return;
        const cur = reqRef.current;
        const meta = metaRef.current;
        const nx = meta && cur.videoId ? nextEpisode(meta, cur.videoId) : null;
        if (!meta || !nx) return;
        busyRef.current = true;
        // Passer à l'épisode suivant = l'épisode en cours compte comme vu
        if (cur.videoId) st().setWatched([cur.videoId], true);
        try {
          p.info({ status: 'Recherche de l\'épisode suivant…' });
          const nextReq = await resolveNextEpisode(meta, nx, cur, (u) => p.info({ status: `Préparation de l'épisode… ${u.progress} %` }));
          if (!nextReq) {
            // Pas de source équivalente : retour au choix des sources
            p.close();
            st().openPicker({
              meta: slimMeta(meta), type: 'series', videoId: nx.id, season: nx.season,
              episode: nx.episode ?? nx.number, episodeTitle: episodeTitleOf(nx),
            });
            return;
          }
          if (cur.meta) st().removeProgress(cur.meta.id);
          reqRef.current = nextReq;
          useStore.setState({ player: nextReq });
          await p.load(payload(nextReq));
          p.info({ status: undefined });
          sendExtras(nextReq);
        } catch (e) {
          p.info({ status: undefined });
          st().toast(errMsg(e), 'error');
        } finally {
          busyRef.current = false;
        }
      }),
    ];

    // Ouverture unique (le double montage du mode strict ne relance pas mpv)
    if (!openedRef.current) {
      openedRef.current = true;
      p.open(payload(reqRef.current)).then((r) => {
        if (!alive()) return;
        if (!r.ok) fallback(r.error);
        else sendExtras(reqRef.current);
      });
    }

    return () => {
      aliveRef.current = false;
      offs.forEach((o) => o());
    };
  }, []);

  // La fenêtre principale reste noire derrière la vidéo
  return <div className="mpv-backdrop" />;
}
