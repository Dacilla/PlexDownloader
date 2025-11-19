/**
 * Downloads Screen
 * Displays a list of all current and completed downloads with management options.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, Image, ActivityIndicator, Alert } from 'react-native';
import { getAllDownloads, findOrphanedFiles, deleteOrphanedFile, OrphanedFile, clearThumbnailCache } from '../database/operations';
import { DownloadRecord, DownloadStatus } from '../database/schema';
import { PlexMovie, PlexEpisode } from '../types/plex';
import ProgressBar from '../components/ProgressBar';
import StorageInfo from '../components/StorageInfo';
import downloadService from '../services/downloadService';
import { formatBytes } from '../utils/formatters';

const REFRESH_INTERVAL_MS = 2000;
const STALL_THRESHOLD_MS = 8000;

const ActionButton = ({ text, onPress, style, disabled }: { text: string, onPress: () => void, style?: any, disabled?: boolean }) => (
    <Pressable onPress={onPress} style={[styles.actionButton, style, disabled && styles.disabledButton]} disabled={disabled}>
        <Text style={styles.actionButtonText}>{text}</Text>
    </Pressable>
);

interface DownloadSpeed {
  speed: number;
  stalled: boolean;
}

const DownloadItem = React.memo(({ 
  item, 
  speedInfo,
  onPause, 
  onResume, 
  onDelete 
}: { 
  item: DownloadRecord, 
  speedInfo: DownloadSpeed,
  onPause: (id: number) => void, 
  onResume: (id: number) => void, 
  onDelete: (item: DownloadRecord) => void 
}) => {
    const media: PlexMovie | PlexEpisode = JSON.parse(item.cached_metadata_json);
    const title = media.type === 'movie' ? media.title : `${media.grandparentTitle} - S${media.parentIndex}E${media.index}`;
    const progress = (item.file_size && item.downloaded_bytes > 0) ? (item.downloaded_bytes / item.file_size) * 100 : 0;

    return (
        <View style={styles.itemContainer}>
            <Image source={{ uri: item.local_thumbnail_path || undefined }} style={styles.thumbnail} />
            <View style={styles.itemDetails}>
                <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
                <Text style={styles.statusText}>Status: {item.download_status}</Text>
                
                {(item.download_status === DownloadStatus.DOWNLOADING || item.download_status === DownloadStatus.PAUSED) && (
                    <>
                        <ProgressBar progress={progress} />
                        <View style={styles.progressDetails}>
                            <Text style={styles.progressText}>{formatBytes(item.downloaded_bytes)} / {formatBytes(item.file_size || 0)}</Text>
                            {item.download_status === DownloadStatus.DOWNLOADING && (
                                <Text style={[styles.speedText, speedInfo.stalled && styles.stalledText]}>
                                  {speedInfo.stalled ? 'Stalled' : `${formatBytes(speedInfo.speed)}/s`}
                                </Text>
                            )}
                        </View>
                    </>
                )}
                {item.download_status === DownloadStatus.COMPLETED && <Text style={styles.progressText}>{formatBytes(item.file_size || 0)} - Complete</Text>}
                
                <View style={styles.controlsRow}>
                    {item.download_status === DownloadStatus.DOWNLOADING && <ActionButton text="Pause" onPress={() => onPause(item.id)} style={styles.pauseButton}/>}
                    {(item.download_status === DownloadStatus.PAUSED || item.download_status === DownloadStatus.FAILED) && <ActionButton text="Resume" onPress={() => onResume(item.id)} style={styles.resumeButton} />}
                    <ActionButton text="Delete" onPress={() => onDelete(item)} style={styles.deleteButton} />
                </View>
                {item.download_status === DownloadStatus.FAILED && <Text style={styles.errorText} numberOfLines={2}>Error: {item.error_message}</Text>}
            </View>
        </View>
    );
});

const ListHeader = React.memo(({ isScanning, isClearingCache, orphanedFiles, onScan, onClearCache, onDeleteOrphan }: {
    isScanning: boolean;
    isClearingCache: boolean;
    orphanedFiles: OrphanedFile[];
    onScan: () => void;
    onClearCache: () => void;
    onDeleteOrphan: (uri: string) => void;
}) => {
    const showOrphanExplanation = () => Alert.alert("What are Orphaned Files?", "An 'orphaned file' is a downloaded video file that exists on your device's storage but is no longer tracked by the app's database. This can happen if the app is closed unexpectedly during a download.\n\nScanning for orphans will find these lost files and allow you to delete them to free up space.");
    const showCacheExplanation = () => Alert.alert("What is the Poster Cache?","To make browsing faster and work offline, the app saves a small, optimized version of every poster you see.\n\nClearing the cache deletes these saved images. This can fix display issues or free up a small amount of space, but the posters will need to be re-downloaded the next time you see them.");

    return (
        <>
            <Text style={styles.title}>Downloads & Storage</Text>
            <StorageInfo />
            <View style={styles.managementContainer}>
                <Text style={styles.sectionTitle}>Management</Text>
                <View style={styles.managementButtonRow}>
                    <Pressable style={[styles.managementButton, isScanning && styles.disabledButton]} onPress={onScan} disabled={isScanning}>
                        {isScanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Scan for Orphans</Text>}
                    </Pressable>
                    <Pressable style={styles.infoButton} onPress={showOrphanExplanation}><Text style={styles.infoButtonText}>?</Text></Pressable>
                </View>
                <View style={styles.managementButtonRow}>
                    <Pressable style={[styles.managementButton, styles.clearCacheButton, isClearingCache && styles.disabledButton]} onPress={onClearCache} disabled={isClearingCache}>
                        {isClearingCache ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Clear Poster Cache</Text>}
                    </Pressable>
                    <Pressable style={styles.infoButton} onPress={showCacheExplanation}><Text style={styles.infoButtonText}>?</Text></Pressable>
                </View>
            </View>
            {orphanedFiles.length > 0 && (
                <View>
                    <Text style={styles.sectionTitle}>Orphaned Files Found</Text>
                    {orphanedFiles.map(orphan => (
                        <View key={orphan.uri} style={styles.itemContainer}>
                            <View style={[styles.thumbnail, styles.orphanIcon]}><Text style={styles.orphanEmoji}>🗑️</Text></View>
                            <View style={styles.itemDetails}>
                                <Text style={styles.itemTitle} numberOfLines={3}>{orphan.uri.split('/').pop()}</Text>
                                <Text style={styles.statusText}>Size: {formatBytes(orphan.size)}</Text>
                            </View>
                            <Pressable style={styles.deleteButton} onPress={() => onDeleteOrphan(orphan.uri)}><Text style={styles.actionButtonText}>Delete</Text></Pressable>
                        </View>
                    ))}
                </View>
            )}
            <Text style={styles.sectionTitle}>Download Queue</Text>
        </>
    );
});

export default function DownloadsScreen({ onBack }: { onBack: () => void }) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [orphanedFiles, setOrphanedFiles] = useState<OrphanedFile[]>([]);
  const [isClearingCache, setIsClearingCache] = useState(false);
  
  const downloadSpeedsRef = useRef<Map<number, { bytes: number, time: number }>>(new Map());
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAndSetDownloads = useCallback(async () => {
    try {
      const allDownloads = await getAllDownloads();
      setDownloads(allDownloads);
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndSetDownloads();
    
    const hasActiveDownloads = () => downloads.some(d => d.download_status === DownloadStatus.DOWNLOADING);
    
    if (hasActiveDownloads() || downloads.length === 0) {
      intervalIdRef.current = setInterval(fetchAndSetDownloads, REFRESH_INTERVAL_MS);
    } else if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [fetchAndSetDownloads, downloads]);
  
  const downloadSpeeds = useMemo(() => {
    const speeds = new Map<number, DownloadSpeed>();
    const now = Date.now();
    
    downloads.forEach(download => {
      if (download.download_status === DownloadStatus.DOWNLOADING) {
        const lastState = downloadSpeedsRef.current.get(download.id);
        
        if (!lastState) {
          downloadSpeedsRef.current.set(download.id, { bytes: download.downloaded_bytes, time: now });
          speeds.set(download.id, { speed: 0, stalled: false });
          return;
        }
        
        const timeDiff = (now - lastState.time) / 1000;
        const byteDiff = download.downloaded_bytes - lastState.bytes;
        
        if (byteDiff > 0) {
          const currentSpeed = byteDiff / timeDiff;
          speeds.set(download.id, { speed: currentSpeed, stalled: false });
          downloadSpeedsRef.current.set(download.id, { bytes: download.downloaded_bytes, time: now });
        } else if (timeDiff > STALL_THRESHOLD_MS / 1000) {
          speeds.set(download.id, { speed: 0, stalled: true });
        } else {
          speeds.set(download.id, { speed: 0, stalled: false });
        }
      } else {
        speeds.set(download.id, { speed: 0, stalled: false });
        downloadSpeedsRef.current.delete(download.id);
      }
    });
    
    return speeds;
  }, [downloads]);
  
  const handlePause = useCallback(async (id: number) => {
    await downloadService.pauseDownload(id);
    await fetchAndSetDownloads();
  }, [fetchAndSetDownloads]);
  
  const handleResume = useCallback(async (id: number) => {
    try {
      await downloadService.resumeDownload(id);
      await fetchAndSetDownloads();
    } catch (error) {
      Alert.alert('Resume Failed', error instanceof Error ? error.message : 'Could not resume download');
    }
  }, [fetchAndSetDownloads]);

  const handleDelete = useCallback((item: DownloadRecord) => {
    const title = item.download_status === DownloadStatus.COMPLETED ? "Confirm Deletion" : "Confirm Cancellation";
    const message = item.download_status === DownloadStatus.COMPLETED 
      ? "Are you sure you want to delete this completed download?"
      : "Are you sure you want to cancel this download?";

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await downloadService.cancelAndDeleteDownload(item.id);
        await fetchAndSetDownloads();
      }}
    ]);
  }, [fetchAndSetDownloads]);
  
  const handleScanForOrphans = useCallback(async () => {
    setIsScanning(true);
    setOrphanedFiles([]);
    try {
      const orphans = await findOrphanedFiles();
      setOrphanedFiles(orphans);
      if (orphans.length === 0) Alert.alert("Scan Complete", "No orphaned files were found.");
    } catch (error) {
      Alert.alert("Error", "Failed to scan for orphaned files.");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleClearCache = useCallback(() => {
    Alert.alert("Clear Poster Cache", "This will delete all downloaded poster images.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Cache", style: "destructive", onPress: async () => {
            setIsClearingCache(true);
            try {
              await clearThumbnailCache();
              await fetchAndSetDownloads();
              Alert.alert("Success", "Poster cache has been cleared.");
            } catch (error) {
              Alert.alert("Error", "Failed to clear the poster cache.");
            } finally {
              setIsClearingCache(false);
            }
          },
        },
      ]
    );
  }, [fetchAndSetDownloads]);
  
  const handleDeleteOrphan = useCallback(async (uri: string) => {
    try {
      await deleteOrphanedFile(uri);
      setOrphanedFiles(prev => prev.filter(f => f.uri !== uri));
    } catch (error) {
      Alert.alert("Error", `Failed to delete file: ${uri}`);
    }
  }, []);
  
  const renderItem = useCallback(({item}: {item: DownloadRecord}) => (
    <DownloadItem 
      item={item} 
      speedInfo={downloadSpeeds.get(item.id) || { speed: 0, stalled: false }}
      onPause={handlePause} 
      onResume={handleResume} 
      onDelete={handleDelete} 
    />
  ), [downloadSpeeds, handlePause, handleResume, handleDelete]);

  const keyExtractor = useCallback((item: DownloadRecord) => item.id.toString(), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={downloads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<ListHeader isScanning={isScanning} isClearingCache={isClearingCache} orphanedFiles={orphanedFiles} onScan={handleScanForOrphans} onClearCache={handleClearCache} onDeleteOrphan={handleDeleteOrphan} />}
        ListEmptyComponent={!isLoading ? <Text style={styles.emptyText}>You have no downloads.</Text> : null}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListFooterComponent={isLoading ? <ActivityIndicator size="large" color="#e5a00d" /> : null}
        showsVerticalScrollIndicator={false}
      />
      <View style={styles.footer}>
        <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]} onPress={onBack}>
          <Text style={styles.buttonText}>Back to Browser</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#e5a00d', marginBottom: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#e5a00d', marginTop: 20, marginBottom: 10, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 20 },
  itemContainer: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333', width: '100%', alignItems: 'center' },
  thumbnail: { width: 60, height: 90, borderRadius: 4, backgroundColor: '#333', marginRight: 15 },
  itemDetails: { flex: 1 },
  itemTitle: { fontSize: 16, color: '#fff', fontWeight: 'bold', marginBottom: 5 },
  statusText: { fontSize: 14, color: '#ccc', textTransform: 'capitalize', marginBottom: 8 },
  errorText: { fontSize: 12, color: '#ff4444', marginTop: 4 },
  progressDetails: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  progressText: { fontSize: 12, color: '#ccc' },
  speedText: { fontSize: 12, color: '#28a745', fontWeight: 'bold' },
  stalledText: { color: '#ffc107' },
  controlsRow: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' },
  actionButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 5, marginRight: 10, marginBottom: 5 },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  pauseButton: { backgroundColor: '#ffc107' },
  resumeButton: { backgroundColor: '#28a745' },
  deleteButton: { backgroundColor: '#dc3545' },
  emptyText: { fontSize: 16, color: '#ccc', textAlign: 'center', marginVertical: 20 },
  footer: { position: 'absolute', bottom: 0, left: 20, right: 20, paddingBottom: 20, backgroundColor: '#1a1a1a' },
  backButton: { backgroundColor: '#444', paddingVertical: 15, borderRadius: 8, alignItems: 'center' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  managementContainer: { width: '100%', marginTop: 10 },
  managementButtonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  managementButton: { backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1 },
  clearCacheButton: { backgroundColor: '#6c757d' },
  disabledButton: { backgroundColor: '#555' },
  infoButton: { marginLeft: 10, backgroundColor: '#555', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  infoButtonText: { color: '#fff', fontWeight: 'bold' },
  orphanIcon: { justifyContent: 'center', alignItems: 'center' },
  orphanEmoji: { fontSize: 24 },
});