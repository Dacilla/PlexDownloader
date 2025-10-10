/**
 * Database operations for PlexDownloader
 * All CRUD operations for downloads, servers, and queue management
 */

import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase, DownloadRecord, ServerRecord, DownloadStatus } from './schema';


export async function saveServer(server: Omit<ServerRecord, 'last_connected'>): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO servers 
     (server_identifier, name, access_token, base_url, owned, last_connected, cached_metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      server.server_identifier,
      server.name,
      server.access_token,
      server.base_url,
      server.owned,
      now,
      server.cached_metadata_json,
    ]
  );
}

export async function getServer(serverIdentifier: string): Promise<ServerRecord | null> {
  const db = getDatabase();
  return await db.getFirstAsync<ServerRecord>('SELECT * FROM servers WHERE server_identifier = ?', [serverIdentifier]);
}

export async function addDownload(params: {
  mediaRatingKey: string;
  serverIdentifier: string;
  localFilePath: string;
  metadataJson: string;
  localThumbnailPath: string | null;
}): Promise<number> {
  const { mediaRatingKey, serverIdentifier, localFilePath, metadataJson, localThumbnailPath } = params;
  const db = getDatabase();
  const now = Date.now();

  const result = await db.runAsync(
    `INSERT INTO downloads 
     (media_rating_key, server_identifier, local_file_path, cached_metadata_json, local_thumbnail_path, download_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mediaRatingKey, serverIdentifier, localFilePath, metadataJson, localThumbnailPath, DownloadStatus.PENDING, now, now]
  );

  return result.lastInsertRowId;
}

export async function getDownload(id: number): Promise<DownloadRecord | null> {
  const db = getDatabase();
  return await db.getFirstAsync<DownloadRecord>('SELECT * FROM downloads WHERE id = ?', [id]);
}

export async function getDownloadByMediaKey(
  mediaRatingKey: string,
  serverIdentifier: string
): Promise<DownloadRecord | null> {
  const db = getDatabase();
  return await db.getFirstAsync<DownloadRecord>(
    'SELECT * FROM downloads WHERE media_rating_key = ? AND server_identifier = ?',
    [mediaRatingKey, serverIdentifier]
  );
}

export async function getAllDownloads(): Promise<DownloadRecord[]> {
  const db = getDatabase();
  return await db.getAllAsync<DownloadRecord>('SELECT * FROM downloads ORDER BY created_at DESC');
}

export async function getDownloadsByStatus(status: DownloadStatus | DownloadStatus[]): Promise<DownloadRecord[]> {
    const db = getDatabase();
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => '?').join(',');
    return await db.getAllAsync<DownloadRecord>(
        `SELECT * FROM downloads WHERE download_status IN (${placeholders}) ORDER BY created_at DESC`,
        statuses
    );
}

export async function updateDownloadStatus(id: number, status: DownloadStatus, errorMessage?: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE downloads SET download_status = ?, error_message = ?, updated_at = ? WHERE id = ?',
    [status, errorMessage || null, Date.now(), id]
  );
}

export async function updateDownloadProgress(id: number, downloadedBytes: number, fileSize?: number): Promise<void> {
  const db = getDatabase();
  if (fileSize !== undefined) {
    await db.runAsync(
      'UPDATE downloads SET downloaded_bytes = ?, file_size = ?, updated_at = ? WHERE id = ?',
      [downloadedBytes, fileSize, Date.now(), id]
    );
  } else {
    await db.runAsync('UPDATE downloads SET downloaded_bytes = ?, updated_at = ? WHERE id = ?', [downloadedBytes, Date.now(), id]);
  }
}

export async function updateDownloadThumbnail(id: number, localThumbnailPath: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync('UPDATE downloads SET local_thumbnail_path = ? WHERE id = ?', [localThumbnailPath, id]);
}

export async function updateDownloadResumeData(id: number, resumeData: string | null): Promise<void> {
    const db = getDatabase();
    await db.runAsync('UPDATE downloads SET resume_data = ? WHERE id = ?', [resumeData, id]);
}

export async function deleteDownload(id: number): Promise<void> {
  const db = getDatabase();
  const download = await getDownload(id);
  if (download) {
    try {
      await FileSystem.deleteAsync(download.local_file_path, { idempotent: true });
      if (download.local_thumbnail_path) {
        await FileSystem.deleteAsync(download.local_thumbnail_path, { idempotent: true });
      }
    } catch (error) {
      console.error('Error deleting files during download record deletion:', error);
    }
  }
  await db.runAsync('DELETE FROM downloads WHERE id = ?', [id]);
}


export interface OrphanedFile {
  uri: string;
  size: number;
}

export async function findOrphanedFiles(): Promise<OrphanedFile[]> {
  const downloadsDir = `${FileSystem.documentDirectory}downloads/`;
  const orphanedFiles: OrphanedFile[] = [];
  try {
    const dirContents = await FileSystem.readDirectoryAsync(downloadsDir);
    const allDownloads = await getAllDownloads();
    const knownFilePaths = new Set(allDownloads.map(d => d.local_file_path));
    for (const fileName of dirContents) {
      const fileUri = `${downloadsDir}${fileName}`;
      if (!knownFilePaths.has(fileUri)) {
        try {
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (fileInfo.exists && !fileInfo.isDirectory) {
              orphanedFiles.push({ uri: fileUri, size: fileInfo.size });
            }
        } catch (e) { /* File might have been deleted */ }
      }
    }
  } catch (error) { /* Dir might not exist */ }
  return orphanedFiles;
}

export async function deleteOrphanedFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function clearThumbnailCache(): Promise<void> {
  const thumbnailsDir = `${FileSystem.documentDirectory}thumbnails/`;
  await FileSystem.deleteAsync(thumbnailsDir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(thumbnailsDir);
}

export async function getAppState(key: string): Promise<string | null> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_state WHERE key = ?', [key]
  );
  return result?.value || null;
}

export async function setAppState(key: string, value: string | null): Promise<void> {
  const db = getDatabase();
  if (value === null) {
    await db.runAsync('DELETE FROM app_state WHERE key = ?', [key]);
  } else {
    await db.runAsync('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', [key, value]);
  }
}

