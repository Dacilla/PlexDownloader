/**
 * PlexDownloader App Entry Point
 * Initializes app, sets up state management and navigation
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { initializeDatabase } from './src/database/schema';
import { getAppState, setAppState } from './src/database/operations';
import plexClient from './src/api/plexClient';
import downloadService from './src/services/downloadService';
import { PlexServer, PlexLibrary, PlexMediaBase, PlexMovie, PlexEpisode } from './src/types/plex';

import AuthScreen from './src/screens/AuthScreen';
import ServerListScreen from './src/screens/ServerListScreen';
import LibraryBrowserScreen from './src/screens/LibraryBrowserScreen';
import MediaListScreen from './src/screens/MediaListScreen';
import MediaDetailScreen from './src/screens/MediaDetailScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import Toast from './src/components/Toast';

enum AppState { LOADING, NEEDS_AUTH, AUTHENTICATED, ERROR }

export default function App() {
  const [appState, setAppState] = useState(AppState.LOADING);
  const [initError, setInitError] = useState<string | null>(null);
  
  const [activeServer, setActiveServer] = useState<PlexServer | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<PlexMediaBase | null>(null);
  const [isViewingDownloads, setIsViewingDownloads] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      await initializeDatabase();
      await downloadService.initialize();
      const userToken = await getAppState('plexUserAuthToken');
      
      if (userToken) {
        plexClient.setUserToken(userToken);
        setAppState(AppState.AUTHENTICATED);
      } else {
        setAppState(AppState.NEEDS_AUTH);
      }
    } catch (error) {
      setInitError(error instanceof Error ? error.message : 'Unknown error');
      setAppState(AppState.ERROR);
    }
  }

  const showToast = (message: string) => setToastMessage(message);

  const handleAuthSuccess = (token: string) => {
    plexClient.setUserToken(token);
    setAppState(AppState.AUTHENTICATED);
  };

  const handleLogout = async () => {
    await setAppState('plexUserAuthToken', null);
    plexClient.setUserToken('');
    plexClient.clearActiveServer();
    setActiveServer(null);
    setSelectedLibrary(null);
    setSelectedMedia(null);
    setAppState(AppState.NEEDS_AUTH);
  };

  const handleServerSelect = (server: PlexServer) => {
    plexClient.setActiveServer(server);
    setActiveServer(server);
  };
  
  const handleLibrarySelect = (library: PlexLibrary) => setSelectedLibrary(library);
  const handleMediaSelect = (media: PlexMediaBase) => setSelectedMedia(media);

  const handleDownload = async () => {
    if (!activeServer || !selectedMedia) {
      showToast('Error: No server or media selected.');
      return;
    }
    try {
      await downloadService.startDownload({
        serverIdentifier: activeServer.machineIdentifier,
        media: selectedMedia as PlexMovie | PlexEpisode
      });
      showToast('Added to downloads!');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Download failed');
    }
  };

  const handleChangeServer = () => {
    plexClient.clearActiveServer();
    setActiveServer(null);
    setSelectedLibrary(null);
    setSelectedMedia(null);
  };
  
  const handleBackToLibraries = () => {
    setSelectedLibrary(null);
    setSelectedMedia(null);
  };

  const handleBackToMediaList = () => setSelectedMedia(null);

  const renderContent = () => {
    if (appState === AppState.LOADING) {
      return <View style={styles.container}><ActivityIndicator size="large" color="#e5a00d" /><Text style={styles.loadingText}>Initializing...</Text></View>;
    }
    if (appState === AppState.ERROR) {
      return <View style={styles.container}><Text style={styles.errorTitle}>Error</Text><Text style={styles.errorText}>{initError}</Text></View>;
    }
    if (appState === AppState.NEEDS_AUTH) {
      return <AuthScreen onAuthenticationSuccess={handleAuthSuccess} />;
    }
    
    if (isViewingDownloads) {
      return <DownloadsScreen onBack={() => setIsViewingDownloads(false)} />;
    }
    
    let browserContent;
    if (!activeServer) {
      browserContent = <ServerListScreen onServerSelect={handleServerSelect} onLogout={handleLogout} />;
    } else if (!selectedLibrary) {
      browserContent = <LibraryBrowserScreen activeServer={activeServer} onSelectLibrary={handleLibrarySelect} onChangeServer={handleChangeServer} onLogout={handleLogout} />;
    } else {
      browserContent = (
        <>
          <MediaListScreen activeServer={activeServer} selectedLibrary={selectedLibrary} onSelectMedia={handleMediaSelect} onChangeLibrary={handleBackToLibraries} />
          {selectedMedia && (
            <View style={StyleSheet.absoluteFillObject}>
              <MediaDetailScreen activeServer={activeServer} selectedMedia={selectedMedia} onDownload={handleDownload} onBack={handleBackToMediaList} />
            </View>
          )}
        </>
      );
    }
    
    return (
      <View style={{ flex: 1 }}>
        {browserContent}
        <Pressable style={styles.downloadsButton} onPress={() => setIsViewingDownloads(true)}>
          <Text style={styles.downloadsButtonText}>View Downloads</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#1a1a1a' }}>
      {renderContent()}
      {toastMessage && <Toast message={toastMessage} onHide={() => setToastMessage(null)} />}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', padding: 20 },
    loadingText: { marginTop: 20, fontSize: 16, color: '#fff' },
    errorTitle: { fontSize: 24, fontWeight: 'bold', color: '#ff4444', marginBottom: 10 },
    errorText: { fontSize: 14, color: '#fff', textAlign: 'center' },
    downloadsButton: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#e5a00d', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25, elevation: 5, zIndex: 10 },
    downloadsButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

