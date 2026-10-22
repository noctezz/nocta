import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { posterOf } from '../lib/ui';
import { openLog, saveEntry, today, useRatePrompt } from '../lib/journal';
import { LikeButton, StarInput } from './Stars';

/** À la sortie d'un film terminé : « Ta note ? » en un clic */
export function RatePrompt() {
  const meta = useRatePrompt((s) => s.meta);
  const player = useStore((s) => s.player);
  const close = () => useRatePrompt.setState({ meta: null });
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
            <span className="rate-prompt-kicker">Tu viens de finir</span>
            <strong>{meta.name}</strong>
            <div className="rate-prompt-stars">
              <StarInput onChange={(v) => { if (v) { saveEntry({ meta, date: today(), rating: v }); close(); useStore.getState().toast(`${meta.name} ajouté à ton journal`, 'success'); } }} size={26} />
              <LikeButton onChange={() => { openLog(meta, { preset: { liked: true } }); close(); }} size={22} />
            </div>
            <button className="rate-prompt-more" onClick={() => { openLog(meta); close(); }}>Écrire une critique…</button>
          </div>
          <button className="rate-prompt-close" onClick={close} aria-label="Plus tard"><X size={16} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
