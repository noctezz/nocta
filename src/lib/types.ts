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
}

export interface Settings {
  torboxKey: string;
  introSound: boolean;
  encoder: string;
  autoplayNext: boolean;
  volume: number;
  subtitleSize: number;
  preferredSubLang: string;
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
}
