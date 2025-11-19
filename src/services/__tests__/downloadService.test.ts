/**
 * Download Service Tests
 * Unit tests for core download functionality
 */

import downloadService from '../downloadService';
import * as FileSystem from 'expo-file-system/legacy';
import { DownloadStatus } from '../../database/schema';
import { PlexMovie } from '../../types/plex';

jest.mock('expo-file-system/legacy');
jest.mock('../../database/operations');
jest.mock('../../api/plexClient');

describe('DownloadService', () => {
  const mockMovie: PlexMovie = {
    ratingKey: '12345',
    key: '/library/metadata/12345',
    guid: 'plex://movie/1234',
    type: 'movie',
    title: 'Test Movie',
    summary: 'A test movie',
    year: 2024,
    duration: 7200000,
    thumb: '/library/metadata/12345/thumb',
    art: '/library/metadata/12345/art',
    addedAt: Date.now(),
    updatedAt: Date.now(),
    Media: [{
      id: 1,
      duration: 7200000,
      bitrate: 5000,
      width: 1920,
      height: 1080,
      aspectRatio: 1.78,
      audioChannels: 2,
      audioCodec: 'aac',
      videoCodec: 'h264',
      videoResolution: '1080p',
      container: 'mp4',
      videoFrameRate: '24p',
      Part: [{
        id: 1,
        key: '/library/parts/1/1234567890/test.mp4',
        duration: 7200000,
        file: '/movies/test.mp4',
        size: 1500000000,
        container: 'mp4',
        Stream: []
      }]
    }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateFileName', () => {
    it('should sanitize movie titles correctly', () => {
      const testCases = [
        { title: 'Test Movie', expected: 'test_movie' },
        { title: 'Test: The Movie!', expected: 'test_the_movie' },
        { title: 'Test___Movie', expected: 'test_movie' },
        { title: 'A'.repeat(150), expected: 'a'.repeat(100) }
      ];

      testCases.forEach(({ title, expected }) => {
        const movie = { ...mockMovie, title };
        const result = (downloadService as any).generateFileName(movie);
        expect(result).toContain(expected);
        expect(result).toMatch(/\.mp4$/);
      });
    });
  });

  describe('retry logic', () => {
    it('should determine retryable errors correctly', () => {
      const retryableErrors = [
        'network timeout',
        'ECONNRESET',
        'ECONNREFUSED',
        'socket hang up'
      ];

      const nonRetryableErrors = [
        'File not found',
        'Permission denied',
        'Invalid format'
      ];

      retryableErrors.forEach(error => {
        expect((downloadService as any).shouldRetryDownload(error, {})).toBe(true);
      });

      nonRetryableErrors.forEach(error => {
        expect((downloadService as any).shouldRetryDownload(error, {})).toBe(false);
      });
    });
  });

  describe('concurrent downloads', () => {
    it('should track active downloads correctly', () => {
      expect(downloadService.getActiveDownloadsCount()).toBe(0);
      expect(downloadService.isDownloadActive(1)).toBe(false);
    });
  });

  describe('directory management', () => {
    it('should ensure directories exist before download', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      mockGetInfo.mockResolvedValue({ exists: false });

      await (downloadService as any).ensureDirectoryExists('downloads');

      expect(mockMakeDir).toHaveBeenCalledWith(
        expect.stringContaining('downloads/'),
        { intermediates: true }
      );
    });

    it('should not create directory if it already exists', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      mockGetInfo.mockResolvedValue({ exists: true });

      await (downloadService as any).ensureDirectoryExists('downloads');

      expect(mockMakeDir).not.toHaveBeenCalled();
    });
  });
});