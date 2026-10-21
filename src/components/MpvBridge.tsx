import { useEffect, useRef } from 'react';
import { getMeta, getSubtitles } from '../lib/addons';
import { useStore } from '../lib/store';
import { useLatest } from '../lib/useLatest';
import { detectIntro, findAlternative } from '../lib/autoplay';
import { getCast, getPerson, getRecap, getScene, getTrivia, type XContext } from '../lib/xray';
import { playerClock } from '../lib/playerClock';
import { langPrefsFor } from '../lib/langPrefs';
import { episodeTitleOf, errMsg, nextEpisode, prepareNextEpisode, recordProgress, resolveNextEpisode, slimMeta, streamToDesc } from '../lib/playback';
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
      ambilight: st().settings.ambilight || 'immersive',
      // VO sous-titrée : la piste originale (souvent anglaise ou japonaise) plutôt que la VF
      alang: langPrefsFor(r.meta?.id).vo ? 'jpn,ja,kor,ko,eng,en'
        : st().settings.preferredSubLang === 'eng' ? 'eng,en' : `${st().settings.preferredSubLang},fre,fra,fr,eng,en`,
    });

    // Infos annexes envoyées à l'interface du lecteur : sous-titres, épisode suivant
    const sendExtras = async (r: PlayRequest) => {
      const settings = st().settings;
      p.info({
        autoplayNext: settings.autoplayNext,
        autoSkipIntro: settings.autoSkipIntro,
        xrayOnPause: settings.xrayOnPause !== false,
        langMode: langPrefsFor(r.meta?.id).vo ? 'vo' : 'vf',
        // Sous-titres FR dès que l'audio n'est pas en français (toujours actif)
        autoFrenchSubs: true,
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
        // Sources de l'épisode suivant vérifiées à l'avance (VF), pour un enchaînement immédiat
        if (nx) setTimeout(() => { if (alive() && reqRef.current.videoId === r.videoId) prepareNextEpisode(meta!, nx, r).catch(() => {}); }, 60000);
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

    // Sources déjà essayées pour la vidéo en cours (repli automatique si l'une ne se lance pas)
    const tried = new Set<string>();
    let triedFor = '';
    let recovering = false;

    const offs = [
      // Source illisible ou bloquée au chargement : on passe toute seule à une autre
      p.on('player:failed', async () => {
        const cur = reqRef.current;
        if (recovering) return;
        const vid = cur.videoId || cur.src;
        if (triedFor !== vid) { tried.clear(); triedFor = vid; }
        tried.add(cur.src);
        const giveUp = (msg = 'Aucune source n\'a pu être lue pour le moment. Réessaie, ou choisis une autre source.') => p.info({ status: undefined, failed: msg });
        if (!cur.type || !cur.videoId || cur.stream?.localPath || tried.size > 3) return giveUp();
        recovering = true;
        try {
          p.info({ status: 'Source indisponible · essai d\'une autre source…' });
          const alt = await findAlternative(cur.type, cur.videoId, cur.meta?.id, tried, (text) => p.info({ status: text }));
          if (!alive()) return;
          if (!alt?.url) return giveUp();
          const nextReq: PlayRequest = { ...cur, src: alt.url, stream: streamToDesc(alt) };
          reqRef.current = nextReq;
          useStore.setState({ player: nextReq });
          await p.load(payload(nextReq));
          p.info({ status: undefined });
          sendExtras(nextReq);
        } catch {
          giveUp();
        } finally {
          recovering = false;
        }
      }),
      // « Réessayer » : même source, à l'endroit où la lecture s'était arrêtée
      p.on('player:retry', async (d: { at?: number } | undefined) => {
        const cur = { ...reqRef.current, startAt: d?.at && d.at > 10 ? d.at : reqRef.current.startAt };
        reqRef.current = cur;
        await p.load(payload(cur));
        sendExtras(cur);
      }),
      // « Choisir une autre source » : retour à la liste des sources de cette vidéo
      p.on('player:pickOther', () => {
        const cur = reqRef.current;
        p.close();
        if (cur.meta && cur.type && cur.videoId) {
          st().openPicker({ meta: cur.meta, type: cur.type, videoId: cur.videoId, season: cur.season, episode: cur.episode, episodeTitle: cur.subtitle });
        }
      }),
      // Générique repéré dans le lecteur (saut manuel) : mémorisé pour toute la série
      // Ambilight changé dans le lecteur : gardé pour les prochaines lectures
      p.on('player:ambilight', (mode: 'off' | 'bars' | 'immersive') => st().updateSettings({ ambilight: mode })),
      p.on('player:intro', (mark: { start: number; end: number } | null) => {
        const r = reqRef.current;
        if (r.type === 'series' && r.meta) {
          st().setIntroMark(r.meta.id, mark);
          if (r.videoId) st().setIntroMark(r.videoId, mark);
        }
      }),
      // X-Ray : demandes du lecteur (distribution, scène, fiche acteur, rattrapage, anecdotes)
      p.on('player:xray', async (q: { op: 'scene' | 'person' | 'recap' | 'trivia'; nonce: number; time?: number; person?: any; range?: 'recent' | 'all' }) => {
        const r = reqRef.current;
        const reply = (data: unknown, error?: string) => { if (alive()) p.info({ xray: { nonce: q.nonce, op: q.op, data, error } }); };
        try {
          if (!r.meta || !r.videoId || !r.type) return reply(null, 'Pas d\'informations sur cette vidéo');
          const meta = metaRef.current?.id === r.meta.id ? metaRef.current : await getMeta(st().addons, r.type, r.meta.id).catch(() => null);
          if (!meta) return reply(null, 'Fiche introuvable');
          metaRef.current = meta;
          const ctx: XContext = { meta, type: r.type, videoId: r.videoId, season: r.season, episode: r.episode, subtitle: r.subtitle };
          if (q.op === 'scene') {
            const cast = await getCast(ctx);
            reply({ cast });
            const scene = await getScene(ctx, q.time || 0, cast);
            reply({ cast, scene });
          } else if (q.op === 'person') reply(await getPerson(q.person));
          else if (q.op === 'recap') reply(await getRecap(ctx, q.time || 0, q.range || 'recent'));
          else if (q.op === 'trivia') reply(await getTrivia(ctx));
        } catch (e) {
          reply(null, errMsg(e));
        }
      }),
      p.on('player:state', (s: { time: number; duration: number }) => {
        stateRef.current = s;
        Object.assign(playerClock, { time: s.time, duration: s.duration, at: Date.now() });
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
          const nextReq = await resolveNextEpisode(meta, nx, cur, (text) => p.info({ status: text }));
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
