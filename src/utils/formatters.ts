/**
 * Formatting Utilities
 * A collection of helper functions for formatting data for display.
 */

/**
 * Formats a number of bytes into a human-readable string (e.g., "1.5 GB").
 * @param bytes The number of bytes.
 * @param decimals The number of decimal places to include.
 * @returns A formatted string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Formats a download speed in bytes per second into a human-readable string.
 * @param bytesPerSecond The speed in bytes per second.
 * @returns A formatted speed string (e.g., "5.2 MB/s").
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 0) return '0 B/s';
  const speedString = formatBytes(bytesPerSecond, 1);
  return `${speedString}/s`;
}

