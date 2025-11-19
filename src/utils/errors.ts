/**
 * Error handling utilities
 * Provides user-friendly error messages based on specific failure modes
 */

import { ERROR_MESSAGES } from './constants';

/**
 * Custom error types for specific failure scenarios
 */
export class PlexAuthenticationError extends Error {
  constructor(message: string = ERROR_MESSAGES.AUTH_FAILED) {
    super(message);
    this.name = 'PlexAuthenticationError';
  }
}

export class PlexServerError extends Error {
  public statusCode?: number;
  
  constructor(message: string = 'Server error occurred', statusCode?: number) {
    super(message);
    this.name = 'PlexServerError';
    this.statusCode = statusCode;
  }
}

export class PlexTranscodeError extends Error {
  constructor(message: string = 'Transcoding failed') {
    super(message);
    this.name = 'PlexTranscodeError';
  }
}

export class PlexDownloadError extends Error {
  public recoverable: boolean;
  
  constructor(message: string = ERROR_MESSAGES.DOWNLOAD_FAILED, recoverable: boolean = true) {
    super(message);
    this.name = 'PlexDownloadError';
    this.recoverable = recoverable;
  }
}

export class PlexNetworkError extends Error {
  constructor(message: string = ERROR_MESSAGES.NO_NETWORK) {
    super(message);
    this.name = 'PlexNetworkError';
  }
}

export class PlexStorageError extends Error {
  constructor(message: string = ERROR_MESSAGES.INSUFFICIENT_STORAGE) {
    super(message);
    this.name = 'PlexStorageError';
  }
}

/**
 * Convert HTTP status codes to user-friendly messages with actionable advice
 */
export function getHttpErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Invalid request. The server could not understand the request.';
    case 401:
      return 'Authentication failed. Please log in again to continue.';
    case 403:
      return 'Access denied. You may not have permission to access this content. Check your server sharing settings.';
    case 404:
      return 'Content not found. It may have been deleted, moved, or is no longer available on the server.';
    case 408:
      return 'Request timeout. The server took too long to respond. Please try again.';
    case 429:
      return 'Too many requests. Please wait a moment before trying again.';
    case 500:
      return 'Server internal error. The server encountered an unexpected problem. Please try again later.';
    case 502:
      return 'Bad gateway. The server is having trouble connecting to upstream services.';
    case 503:
      return 'Server is overloaded or temporarily unavailable. Please wait a few minutes and try again.';
    case 504:
      return 'Gateway timeout. The server is too busy to respond. Please try again later.';
    default:
      if (statusCode >= 400 && statusCode < 500) {
        return `Client error (${statusCode}). There may be an issue with the request. Please try again.`;
      } else if (statusCode >= 500) {
        return `Server error (${statusCode}). The server is experiencing problems. Please try again later.`;
      }
      return `Unexpected response (${statusCode}). Please try again.`;
  }
}

/**
 * Determine if an error is network-related
 */
export function isNetworkError(error: any): boolean {
  if (error instanceof PlexNetworkError) return true;
  
  const networkErrorCodes = ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'];
  const errorCode = error?.code || error?.message;
  
  return networkErrorCodes.some(code => errorCode?.includes(code));
}

/**
 * Determine if an error is recoverable (can be retried)
 */
export function isRecoverableError(error: any): boolean {
  if (error instanceof PlexDownloadError) return error.recoverable;
  
  if (isNetworkError(error)) return true;
  
  if (error?.response?.status) {
    const status = error.response.status;
    return status === 408 || status === 429 || status >= 500;
  }
  
  return false;
}

/**
 * Parse Axios errors into user-friendly messages
 */
export function parseAxiosError(error: any): string {
  if (error.code === 'ECONNABORTED') {
    return 'Request timeout. Please check your internet connection and try again.';
  }
  
  if (error.response) {
    return getHttpErrorMessage(error.response.status);
  } else if (error.request) {
    if (isNetworkError(error)) {
      return ERROR_MESSAGES.NO_NETWORK;
    }
    return 'No response from server. The server may be offline or unreachable.';
  } else {
    return error.message || ERROR_MESSAGES.GENERIC_ERROR;
  }
}

/**
 * Get user-friendly error message for any error with context
 */
export function getUserFriendlyError(error: unknown, context?: string): string {
  let message: string;
  
  if (error instanceof PlexAuthenticationError) {
    message = error.message;
  } else if (error instanceof PlexServerError) {
    message = error.message;
  } else if (error instanceof PlexTranscodeError) {
    message = error.message;
  } else if (error instanceof PlexDownloadError) {
    message = error.message;
  } else if (error instanceof PlexNetworkError) {
    message = error.message;
  } else if (error instanceof PlexStorageError) {
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = ERROR_MESSAGES.GENERIC_ERROR;
  }
  
  return context ? `${context}: ${message}` : message;
}

/**
 * Log error with context for debugging (production would send to error tracking)
 */
export function logError(context: string, error: unknown, additionalInfo?: any): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${context}]`, error);
  
  if (additionalInfo) {
    console.error(`[${context}] Additional info:`, additionalInfo);
  }
  
  if (error instanceof Error && error.stack) {
    console.error(`[${context}] Stack trace:`, error.stack);
  }
}

/**
 * Create a standardized error object for API responses
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    statusCode?: number;
    recoverable: boolean;
  };
}

export function createErrorResponse(error: unknown): ErrorResponse {
  const message = getUserFriendlyError(error);
  const recoverable = isRecoverableError(error);
  
  let code: string | undefined;
  let statusCode: number | undefined;
  
  if (error instanceof Error) {
    code = error.name;
  }
  
  if (error instanceof PlexServerError) {
    statusCode = error.statusCode;
  }
  
  return {
    success: false,
    error: {
      message,
      code,
      statusCode,
      recoverable,
    },
  };
}