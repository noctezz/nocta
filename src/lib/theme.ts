import { useStore } from './store';
import type { Settings } from './types';

export type SeasonTheme = 'none' | 'halloween' | 'christmas';

/** Période automatique : Halloween du 1er octobre au 2 novembre, Noël du 1er décembre au 6 janvier */
export function seasonFor(date: Date): SeasonTheme {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 10 || (m === 11 && d <= 2)) return 'halloween';
  if (m === 12 || (m === 1 && d <= 6)) return 'christmas';
  return 'none';
}

export function resolveTheme(setting: Settings['seasonalTheme'] | undefined, date = new Date()): SeasonTheme {
  switch (setting) {
    case 'off': return 'none';
    case 'halloween': return 'halloween';
    case 'christmas': return 'christmas';
    default: return seasonFor(date);
  }
}

export const useSeasonTheme = () => useStore((s) => resolveTheme(s.settings.seasonalTheme));
