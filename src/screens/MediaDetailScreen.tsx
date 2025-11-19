/**
 * Media Detail Screen
 * Shows detailed information about a media item and download options.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, ActivityIndicator, Image, Dimensions } from 'react-native';
import { PlexServer, PlexMediaBase, PlexMovie } from '../types/plex';
import plexClient from '../api/plexClient';
import { formatBytes } from '../utils/formatters';
import StorageInfo from '../components/StorageInfo';
import * as FileSystem from 'expo-file-system/legacy';

interface MediaDetailScreenProps {
  activeServer: PlexServer;
  selectedMedia: PlexMediaBase;
  onBack: () => void;
  onDownload: () => void;
}

const { width } = Dimensions.get('window');

export default function MediaDetailScreen({
  activeServer,
  selectedMedia,
  onBack,
  onDownload,
}: MediaDetailScreenProps) {
  const [details, setDetails] = useState<PlexMovie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);

  useEffect(() => {
    fetchMediaDetails();
    fetchStorage();
  }, [selectedMedia]);

  const headerImageUrl = useMemo(() => {
    if (!details) return undefined;
    const imagePath = details.art || details.thumb;
    if (!imagePath) return undefined;
    
    const serverUrl = plexClient.getActiveServerUrl();
    const token = plexClient.getActiveServerToken();
    if (!serverUrl || !token) return undefined;
    
    return `${serverUrl}${imagePath}?X-Plex-Token=${token}`;
  }, [details]);
  
  const storageWarningMessage = useMemo(() => {
    if (!details) return null;
    const mediaSize = details.Media?.[0]?.Part?.[0]?.size || 0;
    const hasEnoughSpace = freeSpace !== null && freeSpace > mediaSize;
    
    if (hasEnoughSpace || freeSpace === null) return null;
    const deficit = mediaSize - freeSpace;
    return `Not enough storage. You need ${formatBytes(deficit)} more space.`;
  }, [details, freeSpace]);

  const fetchMediaDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('[MediaDetailScreen] Fetching details for:', selectedMedia.ratingKey);
      const response = await plexClient.getMediaMetadata(selectedMedia.ratingKey);
      const mediaDetails = response.MediaContainer.Metadata?.[0] as PlexMovie;
      if (mediaDetails) {
        setDetails(mediaDetails);
      } else {
        setError("Could not find details for this item.");
      }
    } catch (err) {
      console.error('[MediaDetailScreen] Failed to fetch media details:', err);
      setError("Failed to fetch media details. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStorage = async () => {
    try {
      const free = await FileSystem.getFreeDiskStorageAsync();
      setFreeSpace(free);
    } catch (e) {
      console.error('[MediaDetailScreen] Failed to get free disk space:', e);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e5a00d" />
      </View>
    );
  }

  if (error || !details) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error || "Media details not available."}</Text>
        <Pressable onPress={onBack}>
          <Text style={styles.backButton}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const mediaSize = details.Media?.[0]?.Part?.[0]?.size || 0;
  const hasEnoughSpace = freeSpace !== null && freeSpace > mediaSize;

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.headerImageContainer}>
        <Image
          source={{ uri: headerImageUrl }}
          style={styles.headerImage}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
        <Pressable style={styles.backButtonContainer} onPress={onBack}>
          <Text style={styles.backButtonText}>{'< Back'}</Text>
        </Pressable>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>{details.title}</Text>
          <Text style={styles.subtitle}>{details.year} • {Math.round(details.duration / 60000)} min</Text>
        </View>
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.summary}>{details.summary}</Text>
        <View style={styles.downloadSection}>
          <Text style={styles.downloadHeader}>Storage & Download</Text>
          <StorageInfo />
          <Pressable
            style={({ pressed }) => [styles.downloadButton, !hasEnoughSpace && styles.disabledButton, pressed && hasEnoughSpace && styles.buttonPressed]}
            onPress={onDownload}
            disabled={!hasEnoughSpace}
          >
            <Text style={styles.downloadButtonText}>Download Original Quality</Text>
            <Text style={styles.downloadButtonSubtitle}>Size: {formatBytes(mediaSize)}</Text>
          </Pressable>
          {storageWarningMessage && (
             <Text style={styles.storageWarning}>{storageWarningMessage}</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  headerImageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#333',
    justifyContent: 'flex-end',
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backButtonContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    padding: 5,
    zIndex: 2,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTextContainer: {
    padding: 20,
    zIndex: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: '#cccccc',
    fontSize: 14,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  contentContainer: {
    padding: 20,
  },
  summary: {
    color: '#cccccc',
    fontSize: 16,
    lineHeight: 24,
  },
  downloadSection: {
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#333333',
    paddingTop: 20,
  },
  downloadHeader: {
    color: '#e5a00d',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  downloadButton: {
    backgroundColor: '#e5a00d',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  buttonPressed: {
    backgroundColor: '#c48a0b',
  },
  downloadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  downloadButtonSubtitle: {
    color: '#eeeeee',
    fontSize: 12,
    marginTop: 4,
  },
  storageWarning: {
    color: '#ff4444',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  backButton: {
    color: '#4f8fcf',
    fontSize: 16,
    marginTop: 20,
  },
});