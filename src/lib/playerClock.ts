// Position de lecture du lecteur intégré, connue de la fenêtre principale (mise à jour toutes les 2 s)
export const playerClock = { time: 0, duration: 0, at: 0 };

/** Position estimée maintenant (la lecture a continué depuis la dernière mise à jour) */
export const nowTime = (paused = false) => playerClock.time + (paused || !playerClock.at ? 0 : (Date.now() - playerClock.at) / 1000);
