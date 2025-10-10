/**
 * StorageInfo Component
 * Fetches and displays the device's total and available storage space.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy'; // Use legacy import to avoid deprecation errors
import { formatBytes } from '../utils/formatters';

export default function StorageInfo() {
  const [totalSpace, setTotalSpace] = useState<number | null>(null);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        const total = await FileSystem.getTotalDiskCapacityAsync();
        const free = await FileSystem.getFreeDiskStorageAsync();
        setTotalSpace(total);
        setFreeSpace(free);
      } catch (error) {
        console.error("Failed to get storage information:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStorageInfo();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#cccccc" />
      </View>
    );
  }

  if (totalSpace === null || freeSpace === null) {
    return null; // Don't render if we couldn't get the info
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
});

