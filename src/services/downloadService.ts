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

interface ActiveDownload {
  downloadId: number;
  resumable: FileSystem.DownloadResumable;
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
        console.log(`[DownloadService] Found interrupted download (ID: ${download.id}). Marking as paused for manual resume.`);
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
    } catch (e) {
        await updateDownloadStatus(downloadId, DownloadStatus.FAILED, 'Failed to pause');
    }
  }

  async resumeDownload(downloadId: number): Promise<void> {
    if (activeDownloads.has(downloadId)) return;
    
    const download = await getDownload(downloadId);
    if (!download || download.download_status === 'completed') return;

    const server = await getServer(download.server_identifier);
    if (!server) throw new Error(`Server ${download.server_identifier} not found for download.`);

    const media: PlexMovie | PlexEpisode = JSON.parse(download.cached_metadata_json);
    const mediaPart = media.Media[0].Part[0];
    const remoteFileName = mediaPart.file.split('/').pop() || 'media.mp4';
    
    const newDownloadUrl = `${server.base_url}/library/parts/${mediaPart.id}/${String(media.updatedAt)}/${encodeURIComponent(remoteFileName)}?X-Plex-Token=${server.access_token}`;

    let resumable: FileSystem.DownloadResumable;

    if (download.resume_data) {
        const pauseState: FileSystem.DownloadPauseState = JSON.parse(download.resume_data);
        resumable = new FileSystem.DownloadResumable(
            newDownloadUrl,
            download.local_file_path,
            pauseState.options,
            this.createProgressCallback(download.id),
            pauseState.resumeData
        );
    } else {
        resumable = this.createResumableForDownload(download, server);
    }
    
    activeDownloads.set(downloadId, { downloadId, resumable });
    this.executeDownload(downloadId, resumable);
  }
  
  private createProgressCallback(downloadId: number): (p: FileSystem.DownloadProgressData) => void {
    let lastProgressTime = 0;
    let lastSaveTime = 0;
    
    return (progress: FileSystem.DownloadProgressData) => {
      const now = Date.now();
      if (now - lastProgressTime > 1000) {
        lastProgressTime = now;
        updateDownloadProgress(downloadId, progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
      }
      
      const activeDownload = activeDownloads.get(downloadId);
      if (activeDownload && now - lastSaveTime > 5000) {
        lastSaveTime = now;
        const savableState = activeDownload.resumable.savable();
        updateDownloadResumeData(downloadId, JSON.stringify(savableState));
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
    const downloadRecord = { id: downloadId, local_file_path: localPath, cached_metadata_json: JSON.stringify(media), resume_data: null, server_identifier: serverIdentifier } as DownloadRecord;

    const resumable = this.createResumableForDownload(downloadRecord, server);
    activeDownloads.set(downloadId, { downloadId, resumable });
    this.executeDownload(downloadId, resumable);
  }

  private async executeDownload(downloadId: number, resumable: FileSystem.DownloadResumable) {
    try {
      await updateDownloadStatus(downloadId, DownloadStatus.DOWNLOADING);
      const result = await resumable.downloadAsync();
      
      if (result?.status === 200) {
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        if (fileInfo.exists) await updateDownloadProgress(downloadId, fileInfo.size, fileInfo.size);
        await updateDownloadStatus(downloadId, DownloadStatus.COMPLETED);
      } else {
        throw new Error(`Download failed with server status: ${result?.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (activeDownloads.has(downloadId)) {
        if (errorMessage.includes('unexpected end of stream')) {
            const savableState = resumable.savable();
            await updateDownloadResumeData(downloadId, JSON.stringify(savableState));
            await updateDownloadStatus(downloadId, DownloadStatus.PAUSED, "Network connection was lost.");
        } else {
            await updateDownloadStatus(downloadId, DownloadStatus.FAILED, errorMessage);
        }
      } else {
        console.log(`[DownloadService] Download ${downloadId} was paused or cancelled, ignoring subsequent error.`);
      }
    } finally {
      activeDownloads.delete(downloadId);
    }
  }
  
  async cancelAndDeleteDownload(downloadId: number) {
    const activeDownload = activeDownloads.get(downloadId);
    activeDownloads.delete(downloadId);

    if (activeDownload) {
      try {
        await activeDownload.resumable.pauseAsync();
      } catch (e) { /* Ignore */ }
    }
    
    await deleteDownload(downloadId);
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
    } catch (error) {
      console.error(`[DownloadService] Failed to download thumbnail for download ${downloadId}:`, error);
    }
  }
  
  private generateFileName(media: PlexMediaBase): string {
    const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9.\-_]/g, '_').toLowerCase();
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
      }
    } catch (error) {
       await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

export const downloadService = new DownloadService();
export default downloadService;

