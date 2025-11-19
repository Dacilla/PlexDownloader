/**
 * Download Service
 * Manages all download operations, including pause, resume, and recovery.
 */
import * as FileSystem from 'expo-file-system/legacy';
import plexClient from '../api/plexClient';
import {
  addDownload,
  updateDownloadStatus,
  updateDownloadProgress,
  getDownloadByMediaKey,
  deleteDownload,
  updateDownloadThumbnail,
  getDownloadsByStatus,
  updateDownloadResumeData,
  getDownload,
  getServer,
} from '../database/operations';
import { DownloadStatus, DownloadRecord, ServerRecord } from '../database/schema';
import { PlexMediaBase, PlexMovie, PlexEpisode } from '../types/plex';

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE_MS = 2000;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;
const RESUME_DATA_SAVE_INTERVAL_MS = 5000;
const STALL_DETECTION_THRESHOLD_MS = 10000;

interface ActiveDownload {
  downloadId: number;
  resumable: FileSystem.DownloadResumable;
  retryCount: number;
  lastProgressTime: number;
  lastProgressBytes: number;
}

const activeDownloads = new Map<number, ActiveDownload>();
let hasInitialized = false;

class DownloadService {

  async initialize() {
    if (hasInitialized) return;
    hasInitialized = true;

    console.log('[DownloadService] Initializing and checking for interrupted downloads...');
    const downloadsToHandle = await getDownloadsByStatus([DownloadStatus.DOWNLOADING, DownloadStatus.PENDING]);
    
    for (const download of downloadsToHandle) {
        console.log(`[DownloadService] Found interrupted download (ID: ${download.id}). Validating server availability...`);
        
        const server = await getServer(download.server_identifier);
        if (!server) {
          console.log(`[DownloadService] Server ${download.server_identifier} no longer exists. Marking download as failed.`);
          await updateDownloadStatus(download.id, DownloadStatus.FAILED, 'Server no longer available');
          continue;
        }
        
        console.log(`[DownloadService] Marking download ${download.id} as paused for manual resume.`);
        await updateDownloadStatus(download.id, DownloadStatus.PAUSED);
    }
  }

  async startDownload(params: {
    serverIdentifier: string;
    media: PlexMovie | PlexEpisode;
  }): Promise<number> {
    const { serverIdentifier, media } = params;
    const existing = await getDownloadByMediaKey(media.ratingKey, serverIdentifier);
    if (existing) {
      if (existing.download_status === DownloadStatus.FAILED) {
        await this.cancelAndDeleteDownload(existing.id);
      } else {
        throw new Error('This item is already in the queue.');
      }
    }

    const fileName = this.generateFileName(media);
    const localPath = `${FileSystem.documentDirectory}downloads/${fileName}`;
    await this.ensureDirectoryExists('downloads');
    
    const downloadId = await addDownload({
      mediaRatingKey: media.ratingKey, serverIdentifier, localFilePath: localPath,
      metadataJson: JSON.stringify(media), localThumbnailPath: null,
    });

    this.downloadThumbnail(downloadId, media);
    this.startNewDownload(downloadId, media, localPath, serverIdentifier);
    return downloadId;
  }

  async pauseDownload(downloadId: number): Promise<void> {
    const activeDownload = activeDownloads.get(downloadId);
    if (!activeDownload) {
        await updateDownloadStatus(downloadId, DownloadStatus.PAUSED);
        return;
    }
    try {
        const savableState = await activeDownload.resumable.pauseAsync();
        activeDownloads.delete(downloadId);
        await updateDownloadResumeData(downloadId, JSON.stringify(savableState));
        await updateDownloadStatus(downloadId, DownloadStatus.PAUSED);
        console.log(`[DownloadService] Download ${downloadId} paused successfully`);
    } catch (e) {
        console.error(`[DownloadService] Failed to pause download ${downloadId}:`, e);
        await updateDownloadStatus(downloadId, DownloadStatus.FAILED, 'Failed to pause');
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    if (activeDownloads.has(downloadId)) {
      console.log(`[DownloadService] Download ${downloadId} is already active`);
      return;
    }
    
    const download = await getDownload(downloadId);
    if (!download || download.download_status === 'completed') {
      console.log(`[DownloadService] Download ${downloadId} is not resumable (status: ${download?.download_status})`);
      return;
    }

    const server = await getServer(download.server_identifier);
    if (!server) {
      await updateDownloadStatus(downloadId, DownloadStatus.FAILED, 'Server no longer available');
      throw new Error(`Server ${download.server_identifier} not found for download.`);
    }

    const media: PlexMovie | PlexEpisode = JSON.parse(download.cached_metadata_json);
    const mediaPart = media.Media[0].Part[0];
    const remoteFileName = mediaPart.file.split('/').pop() || 'media.mp4';
    
    const newDownloadUrl = `${server.base_url}/library/parts/${mediaPart.id}/${String(media.updatedAt)}/${encodeURIComponent(remoteFileName)}?X-Plex-Token=${server.access_token}`;

    let resumable: FileSystem.DownloadResumable;

    if (download.resume_data) {
        try {
          const pauseState: FileSystem.DownloadPauseState = JSON.parse(download.resume_data);
          resumable = new FileSystem.DownloadResumable(
              newDownloadUrl,
              download.local_file_path,
              pauseState.options,
              this.createProgressCallback(downloadId),
              pauseState.resumeData
          );
          console.log(`[DownloadService] Resuming download ${downloadId} from saved state`);
        } catch (parseError) {
          console.warn(`[DownloadService] Failed to parse resume data for download ${downloadId}, starting fresh`);
          resumable = this.createResumableForDownload(download, server);
        }
    } else {
        console.log(`[DownloadService] No resume data for download ${downloadId}, starting fresh`);
        resumable = this.createResumableForDownload(download, server);
    }
    
    const activeDownload: ActiveDownload = {
      downloadId,
      resumable,
      retryCount: 0,
      lastProgressTime: Date.now(),
      lastProgressBytes: download.downloaded_bytes
    };
    
    activeDownloads.set(downloadId, activeDownload);
    this.executeDownload(activeDownload);
  }
  
  private createProgressCallback(downloadId: number): (p: FileSystem.DownloadProgressData) => void {
    let lastProgressTime = 0;
    let lastSaveTime = 0;
    
    return (progress: FileSystem.DownloadProgressData) => {
      const now = Date.now();
      const activeDownload = activeDownloads.get(downloadId);
      
      if (activeDownload) {
        activeDownload.lastProgressTime = now;
        activeDownload.lastProgressBytes = progress.totalBytesWritten;
      }
      
      if (now - lastProgressTime > PROGRESS_UPDATE_INTERVAL_MS) {
        lastProgressTime = now;
        updateDownloadProgress(downloadId, progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
      }
      
      if (activeDownload && now - lastSaveTime > RESUME_DATA_SAVE_INTERVAL_MS) {
        lastSaveTime = now;
        try {
          const savableState = activeDownload.resumable.savable();
          updateDownloadResumeData(downloadId, JSON.stringify(savableState));
        } catch (saveError) {
          console.error(`[DownloadService] Failed to save resume data for download ${downloadId}:`, saveError);
        }
      }
    };
  }

  private createResumableForDownload(download: DownloadRecord, server: ServerRecord): FileSystem.DownloadResumable {
    const downloadUrl = this.getDownloadUrlForMedia(download, server);
    return new FileSystem.DownloadResumable(downloadUrl, download.local_file_path, {}, this.createProgressCallback(download.id));
  }
  
  private getDownloadUrlForMedia(download: DownloadRecord, server: ServerRecord): string {
    const media: PlexMovie | PlexEpisode = JSON.parse(download.cached_metadata_json);
    const mediaPart = media.Media[0].Part[0];
    const remoteFileName = mediaPart.file.split('/').pop() || 'media.mp4';
    return `${server.base_url}/library/parts/${mediaPart.id}/${String(media.updatedAt)}/${encodeURIComponent(remoteFileName)}?X-Plex-Token=${server.access_token}`;
  }

  private async startNewDownload(downloadId: number, media: PlexMovie | PlexEpisode, localPath: string, serverIdentifier: string) {
    const server = await getServer(serverIdentifier);
    if (!server) {
        await updateDownloadStatus(downloadId, DownloadStatus.FAILED, 'Server data not found in DB');
        return;
    }
    const downloadRecord = { id: downloadId, local_file_path: localPath, cached_metadata_json: JSON.stringify(media), resume_data: null, server_identifier: serverIdentifier, downloaded_bytes: 0 } as DownloadRecord;

    const resumable = this.createResumableForDownload(downloadRecord, server);
    const activeDownload: ActiveDownload = {
      downloadId,
      resumable,
      retryCount: 0,
      lastProgressTime: Date.now(),
      lastProgressBytes: 0
    };
    
    activeDownloads.set(downloadId, activeDownload);
    this.executeDownload(activeDownload);
  }

  private async executeDownload(activeDownload: ActiveDownload) {
    const { downloadId, resumable } = activeDownload;
    
    try {
      await updateDownloadStatus(downloadId, DownloadStatus.DOWNLOADING);
      console.log(`[DownloadService] Starting download ${downloadId}, attempt ${activeDownload.retryCount + 1}`);
      
      const result = await resumable.downloadAsync();
      
      if (result?.status === 200) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists) {
          await updateDownloadProgress(downloadId, fileInfo.size, fileInfo.size);
          await updateDownloadResumeData(downloadId, null);
        }
        await updateDownloadStatus(downloadId, DownloadStatus.COMPLETED);
        console.log(`[DownloadService] Download ${downloadId} completed successfully`);
      } else {
        throw new Error(`Download failed with server status: ${result?.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DownloadService] Download ${downloadId} error:`, errorMessage);
      
      if (!activeDownloads.has(downloadId)) {
        console.log(`[DownloadService] Download ${downloadId} was paused or cancelled, ignoring subsequent error.`);
        return;
      }
      
      const shouldRetry = this.shouldRetryDownload(errorMessage, activeDownload);
      
      if (shouldRetry && activeDownload.retryCount < MAX_RETRY_ATTEMPTS) {
        await this.retryDownload(activeDownload, errorMessage);
      } else {
        if (errorMessage.includes('unexpected end of stream') || errorMessage.includes('network')) {
            const savableState = resumable.savable();
            await updateDownloadResumeData(downloadId, JSON.stringify(savableState));
            await updateDownloadStatus(downloadId, DownloadStatus.PAUSED, "Network connection was lost. Tap Resume to continue.");
        } else {
            await updateDownloadStatus(downloadId, DownloadStatus.FAILED, errorMessage);
        }
        activeDownloads.delete(downloadId);
      }
    }
  }
  
  private shouldRetryDownload(errorMessage: string, activeDownload: ActiveDownload): boolean {
    const retryableErrors = [
      'timeout',
      'network',
      'ECONNRESET',
      'ECONNREFUSED',
      'socket hang up'
    ];
    
    return retryableErrors.some(retryError => errorMessage.toLowerCase().includes(retryError.toLowerCase()));
  }
  
  private async retryDownload(activeDownload: ActiveDownload, errorMessage: string): Promise<void> {
    activeDownload.retryCount++;
    const delay = RETRY_DELAY_BASE_MS * Math.pow(2, activeDownload.retryCount - 1);
    
    console.log(`[DownloadService] Retrying download ${activeDownload.downloadId} in ${delay}ms (attempt ${activeDownload.retryCount}/${MAX_RETRY_ATTEMPTS})`);
    await updateDownloadStatus(activeDownload.downloadId, DownloadStatus.PAUSED, `Retrying after error: ${errorMessage}`);
    
    setTimeout(() => {
      if (activeDownloads.has(activeDownload.downloadId)) {
        console.log(`[DownloadService] Resuming download ${activeDownload.downloadId} after retry delay`);
        this.executeDownload(activeDownload);
      }
    }, delay);
  }
  
  async cancelAndDeleteDownload(downloadId: number) {
    const activeDownload = activeDownloads.get(downloadId);
    activeDownloads.delete(downloadId);

    if (activeDownload) {
      try {
        await activeDownload.resumable.pauseAsync();
        console.log(`[DownloadService] Cancelled active download ${downloadId}`);
      } catch (e) {
        console.warn(`[DownloadService] Error cancelling download ${downloadId}:`, e);
      }
    }
    
    await deleteDownload(downloadId);
    console.log(`[DownloadService] Deleted download ${downloadId}`);
  }
  
  private async downloadThumbnail(downloadId: number, media: PlexMediaBase): Promise<void> {
    if (!media.thumb) return;
    await this.ensureDirectoryExists('thumbnails');
    const thumbnailUrl = plexClient.getTranscodedImageUrl(media.thumb, 200, 300);
    if (!thumbnailUrl) return;
    const localPath = `${FileSystem.documentDirectory}thumbnails/${media.ratingKey}.jpg`;
    try {
      await FileSystem.downloadAsync(thumbnailUrl, localPath);
      await updateDownloadThumbnail(downloadId, localPath);
      console.log(`[DownloadService] Downloaded thumbnail for ${downloadId}`);
    } catch (error) {
      console.error(`[DownloadService] Failed to download thumbnail for download ${downloadId}:`, error);
    }
  }
  
  private generateFileName(media: PlexMediaBase): string {
    const sanitize = (str: string) => {
      return str.replace(/[^a-zA-Z0-9.\-_]/g, '_')
                .replace(/_{2,}/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase()
                .substring(0, 100);
    };
    
    const timestamp = Date.now();
    if (media.type === 'movie') {
      return `${sanitize(media.title)}_${timestamp}.mp4`;
    } else if (media.type === 'episode') {
      const episode = media as PlexEpisode;
      return `${sanitize(episode.grandparentTitle)}_s${episode.parentIndex}e${episode.index}_${timestamp}.mp4`;
    }
    return `media_${timestamp}.mp4`;
  }
  
  private async ensureDirectoryExists(name: 'downloads' | 'thumbnails'): Promise<void> {
    const dir = `${FileSystem.documentDirectory}${name}/`;
    try {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        console.log(`[DownloadService] Created directory: ${dir}`);
      }
    } catch (error) {
       await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
       console.log(`[DownloadService] Created directory after error: ${dir}`);
    }
  }
  
  getActiveDownloadsCount(): number {
    return activeDownloads.size;
  }
  
  isDownloadActive(downloadId: number): boolean {
    return activeDownloads.has(downloadId);
  }
}

export const downloadService = new DownloadService();
export default downloadService;