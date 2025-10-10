/**
 * Library Browser Screen
 * Fetches and displays the media libraries from the selected server.
 */
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { PlexServer, PlexLibrary } from '../types/plex';
import plexClient from '../api/plexClient';

interface LibraryBrowserScreenProps {
  activeServer: PlexServer;
  onLogout: () => void;
  onChangeServer: () => void;
  onSelectLibrary: (library: PlexLibrary) => void;
}

export default function LibraryBrowserScreen({ activeServer, onLogout, onChangeServer, onSelectLibrary }: LibraryBrowserScreenProps) {
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('LibraryBrowserScreen mounted, activeServer:', activeServer?.name);
    console.log('Active server URL from client:', plexClient.getActiveServerUrl());
    fetchLibraries();
  }, [activeServer]);

  const fetchLibraries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const serverUrl = plexClient.getActiveServerUrl();
      console.log('Fetching libraries from:', serverUrl);
      
      if (!serverUrl) {
        throw new Error('No active server URL configured');
      }
      
      const response = await plexClient.getLibrarySections();
      console.log('Library sections response:', response);
      
      const fetchedLibraries = response.MediaContainer.Directory || [];
      console.log('Found libraries:', fetchedLibraries.length);
      
      const supportedLibraries = fetchedLibraries.filter(lib => lib.type === 'movie' || lib.type === 'show');
      console.log('Supported libraries:', supportedLibraries.length);
      
      if (supportedLibraries.length === 0) {
        setError("No movie or TV show libraries found on this server.");
      }
      setLibraries(supportedLibraries);
    } catch (err) {
      console.error('Error fetching libraries:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch libraries: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderLibraryItem = ({ item }: { item: PlexLibrary }) => (
    <Pressable
      style={({ pressed }) => [styles.libraryItem, pressed && styles.libraryItemPressed]}
      onPress={() => onSelectLibrary(item)}
    >
      <Text style={styles.libraryType}>{item.type === 'movie' ? 'Movies' : 'TV Shows'}</Text>
      <Text style={styles.libraryTitle}>{item.title}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.serverName} numberOfLines={1}>{activeServer.name}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onChangeServer}>
            <Text style={styles.actionButton}>Change Server</Text>
          </Pressable>
          <Pressable onPress={onLogout}>
            <Text style={styles.actionButton}>Log Out</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.title}>Libraries</Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e5a00d" />
          <Text style={styles.loadingText}>Loading libraries...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable 
            style={styles.retryButton}
            onPress={fetchLibraries}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={libraries}
          renderItem={renderLibraryItem}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  serverName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    fontSize: 14,
    color: '#4f8fcf',
  },
  title: {
    fontSize: 20,
    color: '#e5a00d',
    paddingHorizontal: 20,
    marginBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 20,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#cccccc',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#ff4444',
    marginBottom: 20,
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: '#e5a00d',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 20,
  },
  libraryItem: {
    backgroundColor: '#2b2b2b',
    padding: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  libraryItemPressed: {
    backgroundColor: '#3c3c3c',
  },
  libraryType: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#cccccc',
    marginBottom: 4,
  },
  libraryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});