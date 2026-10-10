import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { playClick } from '../lib/sound';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { ProfileEditor } from './ProfileEditor';

export function ProfileGate() {
  const profiles = useStore((s) => s.profiles);
  const selectProfile = useStore((s) => s.selectProfile);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const pick = (id: string) => {
    if (manage) return setEditing(id);
    playClick();
    setChosen(id);
    setTimeout(() => selectProfile(id), 650);
  };

  return (
    <motion.div className="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="gate-top drag"><Logo height={34} /></div>

      <motion.div
        className="gate-center"
        animate={chosen ? { scale: 1.08, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
          {manage ? 'Gérer les profils' : 'Qui est-ce ?'}
        </motion.h1>

        <div className="gate-list">
          {profiles.map((p, i) => (
            <motion.button
              key={p.id}
              className={`gate-profile ${chosen === p.id ? 'is-chosen' : ''}`}
              onClick={() => pick(p.id)}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 220, damping: 22 }}
            >
              <div className="gate-avatar">
                <Avatar avatar={p.avatar} size={150} />
                {manage && <div className="gate-edit"><Pencil size={42} /></div>}
              </div>
              <span>{p.name}</span>
            </motion.button>
          ))}
          {profiles.length < 8 && (
            <motion.button
              className="gate-profile gate-add"
              onClick={() => setEditing('new')}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + profiles.length * 0.06 }}
            >
              <div className="gate-avatar"><div className="gate-plus"><Plus size={70} strokeWidth={1.5} /></div></div>
              <span>Ajouter un profil</span>
            </motion.button>
          )}
        </div>

        <button className={`btn-outline ${manage ? 'is-on' : ''}`} onClick={() => setManage(!manage)}>
          {manage ? 'Terminé' : 'Gérer les profils'}
        </button>
      </motion.div>

      <AnimatePresence>
        {editing && (
          <ProfileEditor
            profileId={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
