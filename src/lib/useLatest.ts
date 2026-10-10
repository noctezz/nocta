import { useRef } from 'react';

/** Garde la dernière valeur non nulle : permet aux fenêtres de rester affichées
 *  pendant leur animation de sortie alors que l'état global est déjà vidé. */
export function useLatest<T>(value: T | null): T | null {
  const ref = useRef(value);
  if (value != null) ref.current = value;
  return ref.current;
}
