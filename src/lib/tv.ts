// NOCTA sur une box ou une TV Android : l'interface s'allège (petit processeur, peu de mémoire)

/** Vrai dans l'appli de la TV (le pont Android est installé avant le reste de l'appli) */
export const IS_TV = window.nocta?.platform === 'android';

/** Images TMDB en taille raisonnable sur la TV (les originales pèsent plusieurs Mo) */
export function lightImg(url: string | undefined, size: 'w342' | 'w780' | 'w1280'): string | undefined {
  if (!IS_TV || !url) return url;
  return url.replace(/(image\.tmdb\.org\/t\/p\/)(original|w1920|w1280|w780|w500)\//, `$1${size}/`);
}
