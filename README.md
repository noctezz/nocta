# NOCTA

Ton streaming perso façon Netflix : profils, intro « ta-doum », rangées animées, fiches détaillées,
addons Stremio, TorBox et un lecteur vidéo maison qui lit les **MKV** (HEVC, AC3, DTS…).

Application de bureau **Electron + React + Vite**, pour un usage strictement personnel.

## Lancer l'app (Windows)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent et [Git](https://git-scm.com).

```bash
git clone https://github.com/noctezz/aurora.git nocta
cd nocta
npm install
npm run dev
```

- `npm run dev` : mode développement (rechargement à chaud).
- `npm start` : compile l'interface puis lance l'app.
- `npm run dist` : fabrique l'installeur Windows (`release/NOCTA Setup x.y.z.exe`).

## Premiers pas

1. **Profils** : choisis ou crée un profil. Pour l'avatar, prends un emoji du preset (32 au choix,
   fond personnalisable), colle n'importe quel emoji, ou importe ta propre photo (recadrée automatiquement).
2. **TorBox** : *Paramètres → TorBox*, colle ta clé API (sur torbox.app/settings), puis clique sur
   *Enregistrer & tester*.
3. **Addons** : l'onglet *Addons* propose d'installer l'addon TorBox en un clic. Tu peux coller l'URL
   de n'importe quel `manifest.json` d'addon Stremio (catalogues, sources, sous-titres).
   Cinemeta (catalogue) et OpenSubtitles (sous-titres) sont installés d'office.
4. Choisis un titre, puis **Lecture**, et sélectionne une source. Les sources marquées ⚡ *Instantané*
   sont déjà en cache sur TorBox.

Tu peux aussi lire une vidéo de ton PC : bouton dossier dans la barre du haut, ou glisser-déposer
le fichier n'importe où dans la fenêtre.

## Le lecteur

- **mpv intégré** (comme Stremio) : mpv lit la vidéo directement, MKV, HEVC, AV1, DTS, TrueHD et
  sous-titres PGS/ASS compris. La synchro image/son est parfaite et le décodage passe par la carte
  graphique. L'interface NOCTA s'affiche par-dessus dans une fenêtre transparente.
  L'installeur Windows embarque mpv. En développement, place `mpv.exe` dans `vendor/mpv/` ou installe mpv.
- **Écran de chargement** : visuel du titre, logo, épisode et progression (y compris pendant que TorBox prépare le fichier).
- Pistes audio, sous-titres internes et des addons, réglage de synchro audio et sous-titres (±0,1 s),
  vitesse, plein écran, reprise, épisode suivant automatique avec la même source.
- Lecteur de secours (Chromium + ffmpeg), sélectionnable dans *Paramètres → Lecture*.
- Raccourcis : `Espace` lecture/pause · `←/→` ±10 s · `↑/↓` volume · `F` plein écran · `M` muet ·
  `N` épisode suivant · `Échap` retour.

## Structure

```
electron/
  main.cjs          fenêtre, IPC
  preload.cjs       pont sécurisé vers l'interface
  mpv.cjs           lecteur mpv intégré (fenêtre vidéo + interface transparente)
  media-server.cjs  serveur local : fichiers, remux/transcodage ffmpeg, sous-titres → WebVTT
  torbox.cjs        API TorBox (cache, résolution des torrents, bibliothèque)
  store.cjs         sauvegarde des profils/réglages (dossier utilisateur)
src/
  components/       Intro, profils, navbar, hero, rangées, popup, fiche, sources, lecteur
  pages/            Accueil, Films, Séries, Ma liste, Recherche, TorBox, Addons, Paramètres
  lib/              protocole addons Stremio, store, son d'intro (Web Audio), sous-titres
```

Le son d'intro est synthétisé en direct (Web Audio). Le logo et les visuels sont originaux.
