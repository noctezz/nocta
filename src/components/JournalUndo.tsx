import { AnimatePresence, motion } from 'framer-motion';
import { undoRemove, useJournalUndo } from '../lib/journal';

/** « X retiré du journal · Annuler » pendant quelques secondes */
export function JournalUndo() {
  const name = useJournalUndo((s) => s.name);
  return (
    <AnimatePresence>
      {name && (
        <motion.div className="jr-undo" initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 10, x: '-50%' }}>
          <span>« {name} » retiré de ton journal</span>
          <button onClick={undoRemove}>Annuler</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
