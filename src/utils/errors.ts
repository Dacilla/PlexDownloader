/**
 * Error handling utilities
 * Provides user-friendly error messages based on specific failure modes
 */

/**
 * Custom error types for specific failure scenarios
 */
export class PlexAuthenticationError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'PlexAuthenticationError';
  }
}

export class PlexServerError extends Error {
  constructor(message: string = 'Server error occurred') {
    super(message);
    this.name = 'PlexServerError';
  }
}

export class PlexTranscodeError extends Error {
  constructor(message: string = 'Transcoding failed') {
    super(message);
    this.name = 'PlexTranscodeError';
  }
}

export class PlexDownloadError extends Error {
  constructor(message: string = 'Download failed') {
    super(message);
    this.name = 'PlexDownloadError';
  }
}

export class PlexNetworkError extends Error {
  constructor(message: string = 'Network error occurred') {
    super(message);
    this.name = 'PlexNetworkError';
  }
}

/**
 * Convert HTTP status codes to user-friendly messages
 * Implements specific error reporting from Section 3.1
 */
export function getHttpErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return 'Authentication failed. Please log in again.';
    case 403:
      return 'Access denied. You may not have permission to access this content.';
    case 404:
      return 'Content not found. It may have been deleted or moved.';
    case 500:
      return 'Server error. Please try again later.';
    case 503:
      return 'Server is overloaded. Please wait and try again.';
    case 504:
      return 'Server timeout. The server may be too busy.';
    default:
      return `Server error (${statusCode}). Please try again.`;
  }
}

/**
 * Parse Axios errors into user-friendly messages
 */
export function parseAxiosError(error: any): string {
  if (error.response) {
    // Server responded with error status
    return getHttpErrorMessage(error.response.status);
  } else if (error.request) {
    // No response received
    return 'No response from server. Check your internet connection.';
  } else {
    // Error setting up request
    return error.message || 'An unexpected error occurred.';
  }
}

/**
 * Get user-friendly error message for any error
 */
export function getUserFriendlyError(error: unknown): string {
  if (error instanceof PlexAuthenticationError) {
    return error.message;
  } else if (error instanceof PlexServerError) {
    return error.message;
  } else if (error instanceof PlexTranscodeError) {
    return error.message;
  } else if (error instanceof PlexDownloadError) {
    return error.message;
  } else if (error instanceof PlexNetworkError) {
    return error.message;
  } else if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Log error with context for debugging
 */
export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);
  
  // In production, this would send to error tracking service
  // For now, just log to console
}