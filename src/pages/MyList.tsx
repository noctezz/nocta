import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Card } from '../components/Card';
import { useProfile } from '../lib/store';

export function MyList() {
  const profile = useProfile();
  const list = profile?.myList || [];
  return (
    <div className="page page-padded">
      <h1 className="page-title">Ma liste</h1>
      {list.length === 0 ? (
        <div className="empty big">
          <Plus size={48} />
          <h3>Ta liste est vide</h3>
          <p>Ajoute des films et des séries avec le bouton <strong>+</strong> pour les retrouver ici.</p>
        </div>
      ) : (
        <div className="grid">
          {list.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.5) }}>
              <Card item={m} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
