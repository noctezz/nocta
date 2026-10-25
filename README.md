# NOCTA

Ton streaming perso façon Netflix : profils, intro « ta-doum », rangées animées, fiches détaillées,
addons Stremio et un lecteur vidéo maison qui lit les **MKV** (HEVC, AC3, DTS…).

Application de bureau **Electron + React + Vite**, pour un usage strictement personnel.

## Lancer l'app (Windows)

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent et [Git](https://git-scm.com).

```bash
git clone https://github.com/noctezz/nocta.git
cd nocta
npm install
npm run dev
```

- `npm run dev` : mode développement (rechargement à chaud).
- `npm start` : compile l'interface puis lance l'app.
- `npm run dist` : fabrique l'installeur Windows (`release/NOCTA Setup x.y.z.exe`).

## NOCTA sur la TV (Android TV : Bbox, TV Sony…)

NOCTA existe aussi en appli Android TV, autonome (pas besoin du PC allumé), installée sans le Play Store.

1. **Récupérer l'APK** : dans les [releases](../../releases), celle nommée *NOCTA TV*, fichier `NOCTA-TV.apk`.
2. **L'installer sur la TV**, au choix :
   - **Clé USB** : copie `NOCTA-TV.apk` sur une clé, branche-la sur la Bbox ou la TV, et ouvre le fichier avec un
     gestionnaire de fichiers (par ex. *X-plore* ou *File Commander*, gratuits sur le Play Store de la TV).
   - **Sans fil** : appli *Send Files to TV* (sur le téléphone et sur la TV), puis ouvre le fichier reçu.
   - La première fois, Android demande d'autoriser l'installation d'applis par ce gestionnaire de fichiers
     (*Installer des applis inconnues*) : accepte.
3. **Récupérer tes profils** : sur le PC, *Paramètres → Envoyer vers la TV* affiche un code ; sur la TV, au choix du
   profil, *Importer depuis mon PC*, puis tape le code. Profils, journal, addons, clé TorBox et réglages sont copiés.

Sur la TV : flèches pour se déplacer, OK pour choisir, Retour pour revenir. Pendant la lecture : OK met en pause,
← → reculent ou avancent de 10 s, ↑ ouvre l'audio et les sous-titres. Le lecteur lit les MKV, le HEVC et le son
DTS, TrueHD et Dolby (décodé par NOCTA si la TV ne sait pas le faire).

## Synchronisation PC ↔ TV

Progression, épisodes vus, Ma liste et journal se suivent d'un appareil à l'autre : un épisode commencé
sur la TV se reprend au même endroit sur le PC.

1. Sur le PC : **Paramètres → Synchronisation PC ↔ TV → Créer le jeton** (jeton GitHub, case « gist »
   seulement, sans expiration), colle-le puis **Activer**.
2. Sur la TV : **Importer depuis mon PC** (le PC fait **Envoyer vers la TV**) : la synchronisation suit.

Les profils sont rangés dans un gist secret de ton compte GitHub. Chaque appareil synchronise au
démarrage, à la fin d'une lecture, après chaque changement et toutes les 2 minutes ; les changements
faits des deux côtés sont fusionnés (la reprise la plus récente l'emporte).

## Premiers pas

1. **Profils** : choisis ou crée un profil. Pour l'avatar, prends un emoji du preset (32 au choix,
   fond personnalisable), colle n'importe quel emoji, ou importe ta propre photo (recadrée automatiquement).
2. **Addons → Découvrir** : le catalogue officiel de Stremio (addons officiels et vérifiés), trié par
   catégorie (Sources, Catalogues, Métadonnées, Sous-titres). *Installer* en un clic, ou *Configurer* :
   la page de l'addon s'ouvre, et son bouton « Install » l'ajoute directement à NOCTA (Comet, Torrentio…
   avec ta clé de débrideur). Le bouton *stremio-addons.net* ouvre l'annuaire communautaire, qui marche pareil.
3. Choisis un titre, puis **Lecture** : la meilleure source démarre directement (qualité max et préférence VF/MULTI
   dans les Paramètres). Le bouton ☰ de la fiche ouvre la liste complète des sources.
   **Vraie VF** : avant de lancer, NOCTA ouvre le début des meilleures sources (liens en cache uniquement) et lit leurs
   vraies pistes audio. Un torrent marqué VF ou MULTI sans piste française passe derrière. Dans la liste ☰, chaque source
   affiche « VF vérifiée », « VFQ vérifiée », « Pas de VF · anglais » ou « Langue non indiquée ». Résultats mémorisés.
   **Nettoyage TorBox** (*Paramètres*, avec ta clé API TorBox) : les sources ouvertes pour vérifier la VF qui ne sont pas
   en français sont retirées de ta liste TorBox. Seuls les torrents ajoutés par la vérification sont concernés.
   **Sources propres** : pas de 4K ni d'HDR (réglable), et la liste ne montre que la langue voulue : VF, ou VO pour un
   titre réglé en « VO · sous-titres FR » (MULTI vérifié pour contenir la piste originale). Les sources sont vérifiées
   une par une, arrêt à la première bonne : une seule source par film ou épisode reste sur TorBox.
4. **Suivi** : les films et épisodes regardés jusqu'au bout sont marqués « Vu » (cochables à la main, saison entière
   d'un clic). « Lecture » reprend au prochain épisode non vu, et l'épisode suivant apparaît dans « Reprendre ».

**Télécommande (iPhone / Android)** : clique sur l'icône téléphone en haut (ou *Paramètres → Télécommande*),
active-la et scanne le QR code avec l'appareil photo. Le téléphone doit être sur le même Wi-Fi que le PC (si Windows
demande l'autorisation, coche *Réseaux privés*). Glisse sur le pavé pour te déplacer, touche le centre pour valider ;
pendant la lecture, le téléphone affiche le titre en cours avec lecture/pause, ±10 s, la barre de progression, le
volume, « Passer l'intro » et « Épisode suivant ». La recherche se tape au clavier du téléphone. Astuce iPhone :
*Partager → Sur l'écran d'accueil* pour l'avoir comme une app. Les flèches du clavier naviguent aussi dans l'app.

**Télécommande en 4G / 5G** : choisis l'onglet *4G / 5G · Tailscale*. Installe [Tailscale](https://tailscale.com/download)
(gratuit) sur le PC et sur l'iPhone avec le même compte, touche *Actualiser*, puis scanne le QR code. Le téléphone
pilote alors NOCTA de n'importe où, sans être sur le Wi-Fi. Si Windows demande l'autorisation, coche *Réseaux privés*
et *Réseaux publics*.

**VF ou VO, titre par titre** : sur la fiche, le sélecteur *Audio : VF / VO · sous-titres FR* est mémorisé pour ce
film ou cette série (par exemple les animés en VOSTFR, tout le reste en VF). En VO, les sources VOSTFR et MULTI passent
devant, la piste originale est choisie et les sous-titres français s'activent tout seuls.

**Sous-titres français automatiques** : quand l'audio n'est pas en français, les sous-titres français s'activent tout
seuls (ceux du fichier, sinon ceux des addons). Réglable dans *Paramètres*.

**Sous-titres recalés automatiquement** : quand NOCTA met des sous-titres français d'un addon (OpenSubtitles…), il
écoute 3 passages de la vidéo pour repérer quand les gens parlent et vérifie que les sous-titres tombent au bon moment.
Décalés ou qui dérivent (version 25 / 23,976 images par seconde) : ils sont recalés tout seuls (« Français · recalés
par NOCTA »). En cas de doute, ils restent tels quels.

**Ambilight** ✨ : pendant la lecture, un halo aux couleurs de l'image déborde autour de la vidéo, comme les TV
Philips. *Immersif* (la vidéo est un peu réduite, la lumière l'entoure), *Bandes noires* (seulement dans les bandes
des films en format cinéma) ou désactivé : bouton ☀ du lecteur, touche **L**, ou *Paramètres → Lecture*.

**Machine à remonter le temps** (onglet *Voyage*) : un tunnel 3D à travers l'histoire du cinéma, de 1920 à
aujourd'hui. Chaque année est une porte lumineuse avec son millésime, les films et séries les mieux notés de l'année
tapissent les parois, et
l'image prend l'allure de chaque époque : muet noir et blanc granuleux qui scintille (avec le cliquetis du
projecteur), Technicolor, sépia des années 70, grille néon et soleil rétro des années 80, VHS des années 90… Molette
pour voyager, frise des décennies pour sauter, voyage automatique, clic sur une affiche pour l'ouvrir.

**Sagas** 🎬 (onglet *Sagas*) : plus de 130 sagas (Marvel, Star Wars, James Bond, Harry Potter, Fast & Furious,
Conjuring, Astérix…) classées par genre, avec une recherche. Chaque saga a sa frise : les films dans l'ordre de sortie
ou dans l'ordre chronologique de l'histoire, ceux déjà vus cochés, et un bouton *Continuer* qui lance le prochain film
à voir. Les films sont retrouvés dans Cinemeta à la première visite, puis gardés en mémoire.

**Journal** ⭐ (onglet *Journal*, ton Letterboxd à toi) : note chaque film ou série en demi-étoiles, ❤ tes coups de
cœur et écris tes critiques (masquées si elles contiennent des spoilers), depuis la barre *Ta note* de chaque fiche.
*Ajouter au journal* enregistre la séance avec sa date (et « je l'avais déjà vu »). À la fin d'un film, une carte
*Ta note ?* propose de le noter en un clic. La page Journal : ton profil et tes 4 films favoris, tes statistiques
(titres, cette année, heures, critiques, coups de cœur, répartition des notes), le journal mois par mois, la grille
de tout ce que tu as noté (tri et filtres), tes critiques, et *À noter* : les films déjà vus dans NOCTA mais pas
encore notés, ajoutés au journal à la date où tu les as vus. Chaque profil a son propre journal.
Les séries se notent en entier, **saison par saison** (note de la saison au-dessus de la liste des épisodes) et
**épisode par épisode** (étoiles sur chaque épisode, au survol). *Ajouter au journal* permet de choisir la série, une
saison ou un épisode précis. Quand tu finis une saison, la carte *Saison 2 terminée : ta note ?* apparaît, et les
saisons terminées non notées attendent dans *À noter*. L'onglet *Séries* du journal montre chaque série avec ses
épisodes vus, sa progression et la note de chaque saison.

**X-Ray** 🔎 : comme sur Prime Video, mais en mieux. À la pause, les personnages de la scène en cours apparaissent
(une IA lit les dialogues autour de ce moment pour savoir qui est là). Touche **X** : le panneau complet avec la scène,
toute la distribution, la fiche de chaque acteur (âge, biographie, autres rôles), un **rattrapage** de ce qui vient de
se passer (5 dernières minutes ou depuis le début, sans spoiler) et des anecdotes. Dans *Paramètres → Avancé → X-Ray* :
les clés d'IA gratuites (Gemini, Groq, OpenRouter, Mistral, Cerebras ; avec plusieurs clés, la suivante prend le relais
quand un service est saturé) et une clé TMDB facultative pour les photos et personnages exacts.

**Mises à jour automatiques** : au lancement, NOCTA regarde s'il existe une nouvelle version. Une carte propose
*Mettre à jour* : téléchargement, installation et redémarrage tout seuls. Aussi dans *Paramètres → Mises à jour*.

**Épisode suivant toujours en VF** : NOCTA garde la même source si elle est en vraie VF, sinon il en cherche une autre
avec une piste française vérifiée, au lieu de renvoyer vers la liste des sources. Les sources de l'épisode suivant
sont vérifiées pendant l'épisode en cours, pour un enchaînement immédiat.

Le bouton agrandir (ou `F11`) passe en vrai plein écran, et le mode est retenu au prochain lancement.
Pour quitter : menu du profil (en haut à droite), puis **Quitter NOCTA**.

Accueil, Films et Séries utilisent le catalogue de base (Cinemeta).

**Plateformes** 📺 (onglet *Plateformes*) : Netflix, Disney+, Apple TV+, Crunchyroll, Canal+, MUBI… comme de vraies
applis. Installe l'addon **Streaming Catalogs** (Addons → Découvrir), choisis la France et coche tes plateformes :
chacune a sa tuile à ses couleurs, puis sa page avec un grand bandeau des titres phares, ses films et séries, ses
tops et des rangées par genre (filtre Tout / Films / Séries). Les addons de sources (Torrentio…) et de métadonnées
n'y apparaissent pas ; les autres addons de catalogue s'affichent en dessous.

Chaque rangée a un lien **Tout voir ›** : toute la catégorie en grille, chargée à l'infini quand tu descends,
sans doublons. Les rangées elles-mêmes chargent la suite quand tu arrives au bout avec la flèche.

**Thèmes saisonniers** (*Paramètres → Thème saisonnier*) : Halloween 🎃 et Noël 🎄. Ils changent les couleurs,
le logo (chapeau de sorcière ou bonnet de Noël), l'intro (rubans, son, message), et ajoutent braises et chauves-souris
ou neige et guirlande. Au choix : *Automatique* (octobre / décembre), toujours Halloween, toujours Noël, ou désactivé.

Tu peux aussi lire une vidéo de ton PC : bouton dossier dans la barre du haut, ou glisser-déposer
le fichier n'importe où dans la fenêtre.

## Le lecteur

- **mpv intégré** (comme Stremio) : mpv lit la vidéo directement, MKV, HEVC, AV1, DTS, TrueHD et
  sous-titres PGS/ASS compris. La synchro image/son est parfaite et le décodage passe par la carte
  graphique. L'interface NOCTA s'affiche par-dessus dans une fenêtre transparente.
  L'installeur Windows embarque mpv. En développement, place `mpv.exe` dans `vendor/mpv/` ou installe mpv.
- **Écran de chargement** : visuel du titre, logo, épisode et progression .
- Pistes audio, sous-titres internes et des addons, réglage de synchro audio et sous-titres (±0,1 s),
  vitesse, plein écran, reprise, épisode suivant automatique avec la même source.
- **Passer l'intro / le résumé** : détection automatique du générique par **empreinte audio** (comme Intro Skipper
  de Jellyfin : le son du début de deux épisodes est comparé, le passage commun est le générique), chapitres du
  fichier, et générique appris quand tu le passes à la main. Option : passer automatiquement.
- Lecture toujours en plein écran (l'état d'avant est rétabli en quittant le lecteur).
- Lecteur de secours (Chromium + ffmpeg), sélectionnable dans *Paramètres → Lecture*.
- Raccourcis : `Espace` lecture/pause · `←/→` ±10 s · `↑/↓` volume · `F` plein écran · `M` muet ·
  `N` épisode suivant · `Échap` retour.

## Structure

```
electron/
  main.cjs          fenêtre, IPC
  preload.cjs       pont sécurisé vers l'interface
  mpv.cjs           lecteur mpv intégré (fenêtre vidéo + interface transparente)
  remote.cjs        télécommande : serveur local + page téléphone (remote/index.html)
  intro.cjs         détection du générique (empreinte audio, cache) + intro-worker.cjs (calculs)
  media-server.cjs  serveur local : fichiers, remux/transcodage ffmpeg, sous-titres → WebVTT
  store.cjs         sauvegarde des profils/réglages (dossier utilisateur)
src/
  components/       Intro, profils, navbar, hero, rangées, popup, fiche, sources, lecteur
  pages/            Accueil, Films, Séries, Ma liste, Recherche, Addons, Paramètres
  lib/              protocole addons Stremio, store, son d'intro (Web Audio), sous-titres
```

Le son d'intro est synthétisé en direct (Web Audio). Le logo et les visuels sont originaux.
