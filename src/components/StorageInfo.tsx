/**
 * StorageInfo Component
 * Fetches and displays the device's total and available storage space.
 * Now with caching and proper error handling.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { formatBytes } from '../utils/formatters';

const CACHE_DURATION_MS = 30000;

let cachedStorageInfo: { total: number; free: number; timestamp: number } | null = null;

export default function StorageInfo() {
  const [totalSpace, setTotalSpace] = useState<number | null>(null);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStorageInfo();
  }, []);

  const fetchStorageInfo = async () => {
    const now = Date.now();
    
    if (cachedStorageInfo && (now - cachedStorageInfo.timestamp) < CACHE_DURATION_MS) {
      console.log('[StorageInfo] Using cached storage info');
      setTotalSpace(cachedStorageInfo.total);
      setFreeSpace(cachedStorageInfo.free);
      setIsLoading(false);
      return;
    }
    
    try {
      console.log('[StorageInfo] Fetching storage info...');
      const total = await FileSystem.getTotalDiskCapacityAsync();
      const free = await FileSystem.getFreeDiskStorageAsync();
      
      cachedStorageInfo = { total, free, timestamp: now };
      
      setTotalSpace(total);
      setFreeSpace(free);
      setError(null);
    } catch (error) {
      console.error('[StorageInfo] Failed to get storage information:', error);
      setError('Unable to retrieve storage information');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#cccccc" />
      </View>
    );
  }

  if (error || totalSpace === null || freeSpace === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error || 'Storage info unavailable'}</Text>
      </View>
    );
  }

  const usedSpace = totalSpace - freeSpace;
  const percentageUsed = (usedSpace / totalSpace) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.storageText}>
        <Text style={styles.bold}>{formatBytes(freeSpace)}</Text> free of <Text style={styles.bold}>{formatBytes(totalSpace)}</Text>
      </Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${percentageUsed}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    margin: 20,
  },
  storageText: {
    color: '#cccccc',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#444444',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e5a00d',
    borderRadius: 4,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    textAlign: 'center',
  },
});