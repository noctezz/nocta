// NOCTA sur une box ou une TV Android : l'interface s'allège (petit processeur, peu de mémoire)

/** Vrai dans l'appli de la TV (le pont Android est installé avant le reste de l'appli) */
export const IS_TV = window.nocta?.platform === 'android';

/** Images TMDB en taille raisonnable sur la TV (les originales pèsent plusieurs Mo) */
export function lightImg(url: string | undefined, size: 'w300' | 'w342' | 'w780' | 'w1280'): string | undefined {
  if (!IS_TV || !url) return url;
  return url.replace(/(image\.tmdb\.org\/t\/p\/)(original|w1920|w1280|w780|w500|w342|w300)\//, `$1${size}/`);
}

// Petites images pour les cartes : une carte n'a pas besoin d'un fond de 1280 px (des centaines
// de Mo de mémoire sur une page de Sagas). Si le serveur n'a pas de petite taille, retour à la normale.
const SMALL_KEY = 'nocta-tv-small-img';
let smallOk = IS_TV && (() => { try { return localStorage.getItem(SMALL_KEY) !== '0'; } catch { return true; } })();

export function cardImg(url: string | undefined): string | undefined {
  if (!smallOk || !url) return url;
  return url.replace(/(images\.metahub\.space\/(?:background|poster))\/medium\//, '$1/small/');
}

/** Petite image introuvable : on recharge l'image normale (et on n'essaie plus les petites) */
export function cardImgFailed(img: HTMLImageElement, original: string | undefined): boolean {
  if (!original || !/\/small\//.test(img.src) || img.src === original) return false;
  smallOk = false;
  try { localStorage.setItem(SMALL_KEY, '0'); } catch { /* pas de stockage */ }
  img.src = original;
  return true;
}
