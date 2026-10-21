export type ContentType = 'movie' | 'series' | string;

export interface MetaPreview {
  id: string;
  type: ContentType;
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  runtime?: string;
}

export interface Video {
  id: string;
  title?: string;
  name?: string;
  season?: number;
  episode?: number;
  number?: number;
  released?: string;
  thumbnail?: string;
  overview?: string;
  description?: string;
}

export interface Meta extends MetaPreview {
  videos?: Video[];
  cast?: string[];
  director?: string[];
  writer?: string[];
  country?: string;
  links?: { name: string; category: string; url?: string }[];
}

export interface Stream {
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  ytId?: string;
  externalUrl?: string;
  name?: string;
  title?: string;
  description?: string;
  behaviorHints?: { filename?: string; bingeGroup?: string; notWebReady?: boolean; videoSize?: number };
}

export interface CatalogDef {
  type: string;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
  extraRequired?: string[];
  extraSupported?: string[];
}

export type ResourceDef = string | { name: string; types?: string[]; idPrefixes?: string[] };

export interface Manifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  logo?: string;
  background?: string;
  types?: string[];
  resources?: ResourceDef[];
  idPrefixes?: string[];
  catalogs?: CatalogDef[];
}

export interface InstalledAddon {
  url: string; // URL du manifest
  manifest: Manifest;
}

/** Ce qu'il faut pour relancer une lecture (reprise, continuer à regarder) */
export interface StreamDesc {
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  filename?: string;
  localPath?: string;
  label?: string;
  bingeGroup?: string;
}

export type Avatar =
  | { kind: 'emoji'; emoji: string; bg: string }
  | { kind: 'image'; data: string };

export interface ProgressEntry {
  meta: MetaPreview;
  videoId: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  position: number;
  duration: number;
  updatedAt: number;
  stream?: StreamDesc;
}

export interface Profile {
  id: string;
  name: string;
  avatar: Avatar;
  myList: MetaPreview[];
  progress: Record<string, ProgressEntry>;
  /** Vidéos vues (id d'épisode ou de film) → date */
  watched?: Record<string, number>;
  /** Langue choisie pour un titre précis (id du film / de la série) : VF ou VO sous-titrée */
  langPrefs?: Record<string, LangMode>;
}

export type LangMode = 'vf' | 'vo';

/** Plage de générique d'une série (secondes), apprise ou issue des chapitres */
export interface IntroMark { start: number; end: number }

export interface Settings {
  introSound: boolean;
  encoder: string;
  autoplayNext: boolean;
  volume: number;
  subtitleSize: number;
  /** Halo lumineux autour de la vidéo (lecteur intégré) */
  ambilight?: 'off' | 'bars' | 'immersive';
  preferredSubLang: string;
  playerEngine: 'mpv' | 'web';
  /** Thème saisonnier : auto (selon la date), désactivé, ou forcé */
  seasonalTheme: 'auto' | 'off' | 'halloween' | 'christmas';
  /** Bande-annonce lancée automatiquement dans les fiches */
  autoplayTrailers: boolean;
  /** Résolution maximale préférée pour le choix auto */
  maxResolution: 2160 | 1080 | 720;
  /** Préférer les sources en français (VF / MULTI / TRUEFRENCH) */
  preferFrench: boolean;
  /** Vérifier la vraie langue des sources (pistes audio) avant de lancer */
  verifyLanguage: boolean;
  /** Sous-titres français activés tout seuls quand l'audio n'est pas en français */
  autoFrenchSubs: boolean;
  /** Masquer les sources 4K, HDR et Dolby Vision (inutiles sur un écran de PC classique) */
  hideUhd?: boolean;
  /** Clé API TorBox (reste sur ce PC) : sert seulement au nettoyage des sources essayées */
  torboxKey?: string;
  /** Clé TMDB (facultative) : photos et personnages précis pour l'X-Ray */
  tmdbKey?: string;
  /** X-Ray affiché tout seul quand on met pause */
  xrayOnPause?: boolean;
  /** Retirer de TorBox les sources ouvertes pour vérification qui ne sont pas en VF */
  torboxCleanup?: boolean;
  /** Nombre de torrents retirés par ce nettoyage */
  torboxCleaned?: number;
  /** Ancienne clé Gemini unique (remplacée par noxKeys) */
  noxKey?: string;
  /** Clés des services d'IA de Nox, dans l'ordre d'essai */
  noxKeys?: { provider: 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'cerebras'; key: string }[];
  /** Afficher Nox en bas de l'écran */
  noxVisible?: boolean;
  /** Nox répond à voix haute : jamais, quand on lui parle au micro, ou toujours */
  noxVoice?: 'off' | 'mic' | 'always';
  /** Nox dit bonjour en arrivant et « bon visionnage » au lancement */
  noxGreet?: boolean;
  /** Mode Jarvis : Nox écoute en permanence (mot magique « Nox ») */
  jarvis?: boolean;
  /** Dans les menus : seulement après « Nox », ou toutes les phrases */
  jarvisWake?: 'nox' | 'all';
  /** Voix de Nox : celle de Windows (hors ligne) ou une voix naturelle Gemini */
  noxVoiceEngine?: 'windows' | 'gemini';
  /** Nom de la voix choisie (Windows ou Gemini) */
  noxVoiceName?: string;
  /** Passer automatiquement le générique (sinon : bouton) */
  autoSkipIntro: boolean;
  /** Détection du générique par analyse audio */
  introDetection: boolean;
}

export interface PlayRequest {
  src: string;
  title: string;
  subtitle?: string;
  meta?: MetaPreview;
  type?: string;
  videoId?: string;
  season?: number;
  episode?: number;
  stream?: StreamDesc;
  startAt?: number;
  /** Moteur de lecture : mpv intégré (par défaut) ou lecteur web de secours */
  engine?: 'mpv' | 'web';
}
