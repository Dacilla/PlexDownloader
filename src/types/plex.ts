/**
 * Type definitions for Plex Media Server API
 * Based on official Plex API documentation
 */

// Authentication types
export interface PlexPin {
  id: number;
  code: string;
  authToken: string | null;
}

export interface PlexUser {
  authToken: string;
  username: string;
  email: string;
}

// Server and resource types
export interface PlexServer {
  name: string;
  host: string;
  port: number;
  machineIdentifier: string;
  accessToken: string;
  scheme: string; // 'http' or 'https'
  owned: boolean;
  connections: PlexConnection[];
}

export interface PlexConnection {
  protocol: string;
  address: string;
  port: number;
  uri: string;
  local: boolean;
}

// Library types
export interface PlexLibrary {
  key: string;
  title: string;
  type: 'movie' | 'show' | 'artist' | 'photo';
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
  updatedAt: number;
  createdAt: number;
}

// Media metadata types
export interface PlexMediaBase {
  ratingKey: string;
  key: string;
  guid: string;
  type: string;
  title: string;
  summary?: string;
  thumb?: string;
  art?: string;
  addedAt: number;
  updatedAt: number;
}

export interface PlexMovie extends PlexMediaBase {
  type: 'movie';
  year: number;
  duration: number;
  originallyAvailableAt?: string;
  studio?: string;
  rating?: number;
  Media: PlexMedia[];
}

export interface PlexShow extends PlexMediaBase {
  type: 'show';
  year: number;
  studio?: string;
  rating?: number;
  childCount: number; // number of seasons
  leafCount: number; // number of episodes
}

export interface PlexSeason extends PlexMediaBase {
  type: 'season';
  parentRatingKey: string;
  parentKey: string;
  parentTitle: string;
  index: number;
  leafCount: number; // number of episodes
}

export interface PlexEpisode extends PlexMediaBase {
  type: 'episode';
  parentRatingKey: string; // season
  grandparentRatingKey: string; // show
  grandparentTitle: string;
  parentTitle: string;
  index: number;
  parentIndex: number;
  year: number;
  duration: number;
  originallyAvailableAt?: string;
  Media: PlexMedia[];
}

// Media stream types
export interface PlexMedia {
  id: number;
  duration: number;
  bitrate: number;
  width: number;
  height: number;
  aspectRatio: number;
  audioChannels: number;
  audioCodec: string;
  videoCodec: string;
  videoResolution: string;
  container: string;
  videoFrameRate: string;
  Part: PlexPart[];
}

export interface PlexPart {
  id: number;
  key: string;
  duration: number;
  file: string;
  size: number;
  container: string;
  has64bitOffsets?: boolean;
  optimizedForStreaming?: boolean;
  Stream: PlexStream[];
}

export interface PlexStream {
  id: number;
  streamType: number; // 1=video, 2=audio, 3=subtitle
  codec: string;
  index: number;
  bitrate?: number;
  language?: string;
  languageCode?: string;
  displayTitle?: string;
  selected?: boolean;
  channels?: number; // for audio
  width?: number; // for video
  height?: number; // for video
}

// Download Queue types (Section 3.4 of design doc)
export interface DownloadQueue {
  id: string;
  clientIdentifier: string;
  createdAt: number;
}

export interface DownloadQueueItem {
  id: string;
  mediaRatingKey: string;
  status: 'pending' | 'transcoding' | 'available' | 'failed';
  progress: number; // 0-100
  size?: number;
  error?: string;
  addedAt: number;
  updatedAt: number;
}

export interface DownloadQueueAddParams {
  uri: string; // Plex URI for the media item
  videoBitrate?: number;
  videoResolution?: string; // e.g., "1920x1080"
  audioBoost?: number;
  subtitleSize?: number;
  mediaIndex?: number;
  partIndex?: number;
}

// Server status types
export interface PlexSession {
  sessionKey: string;
  type: 'video' | 'audio' | 'photo';
  title: string;
  user: {
    title: string;
  };
  Player: {
    title: string;
    state: 'playing' | 'paused' | 'buffering';
  };
  TranscodeSession?: {
    key: string;
    throttled: boolean;
    complete: boolean;
    progress: number;
    speed: number;
    duration: number;
    remaining: number;
    context: string;
    videoDecision: string;
    audioDecision: string;
  };
}

// API response wrappers
export interface PlexApiResponse<T> {
  MediaContainer: {
    size: number;
    allowSync: boolean;
    identifier?: string;
    [key: string]: any;
  } & T;
}

export interface PlexLibrariesResponse {
  Directory: PlexLibrary[];
}

export interface PlexMediaResponse {
  Metadata: PlexMediaBase[];
}

export interface PlexSessionsResponse {
  Video?: PlexSession[];
  Audio?: PlexSession[];
  Photo?: PlexSession[];
}