// Langue par titre : chaque film ou série peut être réglé en VF ou en VO sous-titrée,
// sinon c'est le réglage général (Paramètres → Préférer le français) qui s'applique.
import { useStore } from './store';
import type { LangMode } from './types';

export function langModeFor(metaId?: string): LangMode | null {
  if (!metaId) return null;
  const st = useStore.getState();
  return st.profiles.find((p) => p.id === st.activeProfileId)?.langPrefs?.[metaId] || null;
}

/** Préférences effectives pour un titre */
export function langPrefsFor(metaId?: string) {
  const s = useStore.getState().settings;
  const mode = langModeFor(metaId);
  const vo = mode === 'vo';
  const preferFrench = mode ? mode === 'vf' : s.preferFrench;
  return { mode, vo, preferFrench, verify: preferFrench && s.verifyLanguage !== false };
}
