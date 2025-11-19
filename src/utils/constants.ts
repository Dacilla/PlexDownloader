/**
 * Application Constants
 * Centralized configuration values to avoid magic numbers throughout the codebase.
 */

export const API_CONSTANTS = {
  PLEX_TV_URL: 'https://plex.tv',
  CLIENT_IDENTIFIER: 'com.plexdownloader.mobile',
  PRODUCT_NAME: 'PlexDownloader',
  VERSION: '1.0.0',
  PLATFORM: 'Android',
  DEVICE: 'Mobile',
  REQUEST_TIMEOUT_MS: 15000,
  PIN_POLL_INTERVAL_MS: 3000,
};

export const DOWNLOAD_CONSTANTS = {
  MAX_CONCURRENT_DOWNLOADS: 3,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE_MS: 2000,
  PROGRESS_UPDATE_INTERVAL_MS: 1000,
  RESUME_DATA_SAVE_INTERVAL_MS: 5000,
  STALL_DETECTION_THRESHOLD_MS: 10000,
};

export const UI_CONSTANTS = {
  REFRESH_INTERVAL_MS: 2000,
  STORAGE_CACHE_DURATION_MS: 30000,
  TOAST_DURATION_MS: 3000,
  DEBOUNCE_SEARCH_MS: 500,
  PAGE_SIZE: 48,
  INITIAL_RENDER_COUNT: 18,
};

export const IMAGE_CONSTANTS = {
  THUMBNAIL_WIDTH: 200,
  THUMBNAIL_HEIGHT: 300,
  POSTER_WIDTH: 400,
  POSTER_HEIGHT: 600,
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'plexUserAuthToken',
  LAST_SERVER: 'lastSelectedServer',
};

export const ERROR_MESSAGES = {
  NO_NETWORK: 'No internet connection. Please check your network settings.',
  SERVER_UNAVAILABLE: 'Server is not responding. Please try again later.',
  AUTH_FAILED: 'Authentication failed. Please log in again.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  DOWNLOAD_FAILED: 'Download failed. Please try again.',
  INSUFFICIENT_STORAGE: 'Not enough storage space available.',
  MAX_DOWNLOADS: 'Maximum concurrent downloads reached. Please wait for one to finish.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
};