import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { posterOf } from '../lib/ui';
import { openLog, saveEntry, today, useRatePrompt } from '../lib/journal';
import { LikeButton, StarInput } from './Stars';

/** À la sortie d'un film ou d'une saison terminés : « Ta note ? » en un clic */
export function RatePrompt() {
  const { meta, kind, season } = useRatePrompt();
  const player = useStore((s) => s.player);
  const close = () => useRatePrompt.setState({ meta: null, kind: undefined, season: undefined });
  const isSeason = kind === 'season' && season != null;
  const part = isSeason ? { season } : {};
  return (
    <AnimatePresence>
      {meta && !player && (
        <motion.div
          className="rate-prompt"
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.6 }}
        >
          <img src={posterOf(meta)} alt="" />
          <div className="rate-prompt-main">
            <span className="rate-prompt-kicker">{isSeason ? `Saison ${season} terminée` : kind === 'series' ? 'Série terminée' : 'Tu viens de finir'}</span>
            <strong>{meta.name}</strong>
            <div className="rate-prompt-stars">
              <StarInput
                onChange={(v) => {
                  if (!v) return;
                  saveEntry({ meta, date: today(), rating: v, ...part });
                  close();
                  useStore.getState().toast(`${meta.name}${isSeason ? ` · saison ${season}` : ''} : ajouté à ton journal`, 'success');
                }}
                size={26}
              />
              <LikeButton onChange={() => { openLog(meta, { preset: { liked: true, ...part } }); close(); }} size={22} />
            </div>
            <div className="rate-prompt-links">
              <button className="rate-prompt-more" onClick={() => { openLog(meta, { preset: part }); close(); }}>Écrire une critique…</button>
              {isSeason && <button className="rate-prompt-more" onClick={() => { openLog(meta); close(); }}>Noter la série entière</button>}
            </div>
          </div>
          <button className="rate-prompt-close" onClick={close} aria-label="Plus tard"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
