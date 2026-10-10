import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, Smile, Trash2 } from 'lucide-react';
import { EMOJI_PRESETS, useStore } from '../lib/store';
import type { Avatar as AvatarT } from '../lib/types';
import { Avatar } from './Avatar';

const BACKGROUNDS = Array.from(new Set(EMOJI_PRESETS.map((p) => p.bg))).slice(0, 16);

/** Recadre l'image au centre, en carré 320px, et la compresse en JPEG */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 320;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d')!;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

export function ProfileEditor({ profileId, onClose }: { profileId?: string; onClose: () => void }) {
  const existing = useStore((s) => s.profiles.find((p) => p.id === profileId));
  const profilesCount = useStore((s) => s.profiles.length);
  const upsert = useStore((s) => s.upsertProfile);
  const remove = useStore((s) => s.deleteProfile);
  const toast = useStore((s) => s.toast);

  const [name, setName] = useState(existing?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarT>(
    existing?.avatar ?? { kind: 'emoji', ...EMOJI_PRESETS[Math.floor(Math.random() * EMOJI_PRESETS.length)] },
  );
  const [tab, setTab] = useState<'emoji' | 'photo'>(existing?.avatar.kind === 'image' ? 'photo' : 'emoji');
  const [custom, setCustom] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const currentBg = avatar.kind === 'emoji' ? avatar.bg : EMOJI_PRESETS[0].bg;

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      setAvatar({ kind: 'image', data: await fileToAvatar(f) });
    } catch (e) {
      toast(String((e as Error).message), 'error');
    }
  };

  const save = () => {
    if (!name.trim()) return toast('Donne un nom au profil', 'error');
    upsert({ id: profileId, name: name.trim().slice(0, 20), avatar });
    onClose();
  };

  return (
    <motion.div className="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="editor-card"
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <h1>{existing ? 'Modifier le profil' : 'Ajouter un profil'}</h1>
        <div className="editor-main">
          <div className="editor-preview">
            <Avatar avatar={avatar} size={140} />
          </div>
          <div className="editor-fields">
            <input
              className="input input-lg"
              placeholder="Nom"
              value={name}
              maxLength={20}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />

            <div className="tabs">
              <button className={tab === 'emoji' ? 'is-on' : ''} onClick={() => setTab('emoji')}><Smile size={16} /> Emojis</button>
              <button className={tab === 'photo' ? 'is-on' : ''} onClick={() => setTab('photo')}><ImagePlus size={16} /> Ma photo</button>
            </div>

            {tab === 'emoji' ? (
              <>
                <div className="emoji-grid">
                  {EMOJI_PRESETS.map((p) => (
                    <button
                      key={p.emoji}
                      className={avatar.kind === 'emoji' && avatar.emoji === p.emoji ? 'is-on' : ''}
                      onClick={() => setAvatar({ kind: 'emoji', ...p })}
                    >
                      <Avatar avatar={{ kind: 'emoji', ...p }} size={52} />
                    </button>
                  ))}
                </div>
                <div className="editor-row">
                  <input
                    className="input"
                    placeholder="Ou colle n'importe quel emoji…"
                    value={custom}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustom(v);
                      const first = Array.from(new Intl.Segmenter().segment(v.trim()))[0]?.segment;
                      if (first) setAvatar({ kind: 'emoji', emoji: first, bg: currentBg });
                    }}
                  />
                </div>
                <div className="bg-row">
                  {BACKGROUNDS.map((bg) => (
                    <button
                      key={bg}
                      style={{ background: bg }}
                      className={avatar.kind === 'emoji' && avatar.bg === bg ? 'is-on' : ''}
                      onClick={() => avatar.kind === 'emoji' && setAvatar({ ...avatar, bg })}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div
                className="dropzone"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onFile(e.dataTransfer.files[0]); }}
              >
                <ImagePlus size={36} />
                <p><strong>Clique</strong> ou glisse une image ici</p>
                <small>JPG, PNG, GIF, WebP — recadrée automatiquement en carré</small>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
            )}
          </div>
        </div>

        <div className="editor-actions">
          <button className="btn btn-white" onClick={save}>Enregistrer</button>
          <button className="btn-outline" onClick={onClose}>Annuler</button>
          {existing && profilesCount > 1 && (
            <button className="btn-outline danger" onClick={() => { remove(existing.id); onClose(); }}>
              <Trash2 size={16} /> Supprimer le profil
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
