/**
 * PlexDownloader App Entry Point
 * Initializes app, sets up state management and navigation
 */

import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Pressable, Alert } from 'react-native';
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

const MAX_CONCURRENT_DOWNLOADS = 3;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorBoundaryContainer}>
          <Text style={styles.errorBoundaryTitle}>Something went wrong</Text>
          <Text style={styles.errorBoundaryMessage}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable style={styles.errorBoundaryButton} onPress={this.handleReset}>
            <Text style={styles.errorBoundaryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
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
      console.log('[App] Initializing database...');
      await initializeDatabase();
      
      console.log('[App] Initializing download service...');
      await downloadService.initialize();
      
      console.log('[App] Checking for saved auth token...');
      const userToken = await getAppState('plexUserAuthToken');
      
      if (userToken) {
        console.log('[App] Found saved token, checking validity...');
        plexClient.setUserToken(userToken);
        
        if (plexClient.isTokenExpired()) {
          console.warn('[App] Token appears to be expired');
          showToast('Your session may have expired. Please log in again if you encounter errors.');
        }
        
        setAppState(AppState.AUTHENTICATED);
      } else {
        console.log('[App] No saved token found');
        setAppState(AppState.NEEDS_AUTH);
      }
    } catch (error) {
      console.error('[App] Initialization failed:', error);
      setInitError(error instanceof Error ? error.message : 'Unknown error');
      setAppState(AppState.ERROR);
    }
  }

  const showToast = (message: string) => {
    console.log('[App] Toast:', message);
    setToastMessage(message);
  };

  const handleAuthSuccess = async (token: string) => {
    console.log('[App] Authentication successful');
    plexClient.setUserToken(token);
    await setAppState('plexUserAuthToken', token);
    setAppState(AppState.AUTHENTICATED);
  };

  const handleLogout = async () => {
    console.log('[App] Logging out');
    
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out? Your downloads will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await setAppState('plexUserAuthToken', null);
            plexClient.setUserToken('');
            plexClient.clearActiveServer();
            setActiveServer(null);
            setSelectedLibrary(null);
            setSelectedMedia(null);
            setAppState(AppState.NEEDS_AUTH);
          },
        },
      ]
    );
  };

  const handleServerSelect = (server: PlexServer) => {
    console.log('[App] Server selected:', server.name);
    plexClient.setActiveServer(server);
    setActiveServer(server);
  };
  
  const handleLibrarySelect = (library: PlexLibrary) => {
    console.log('[App] Library selected:', library.title);
    setSelectedLibrary(library);
  };
  
  const handleMediaSelect = (media: PlexMediaBase) => {
    console.log('[App] Media selected:', media.title);
    setSelectedMedia(media);
  };

  const handleDownload = async () => {
    if (!activeServer || !selectedMedia) {
      showToast('Error: No server or media selected.');
      return;
    }
    
    const activeDownloadsCount = downloadService.getActiveDownloadsCount();
    if (activeDownloadsCount >= MAX_CONCURRENT_DOWNLOADS) {
      showToast(`Maximum ${MAX_CONCURRENT_DOWNLOADS} concurrent downloads allowed. Please wait for one to finish.`);
      return;
    }
    
    try {
      console.log('[App] Starting download for:', selectedMedia.title);
      await downloadService.startDownload({
        serverIdentifier: activeServer.machineIdentifier,
        media: selectedMedia as PlexMovie | PlexEpisode
      });
      showToast('Added to downloads!');
    } catch (error) {
      console.error('[App] Download failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      showToast(errorMessage);
    }
  };

  const handleChangeServer = () => {
    console.log('[App] Changing server');
    plexClient.clearActiveServer();
    setActiveServer(null);
    setSelectedLibrary(null);
    setSelectedMedia(null);
  };
  
  const handleBackToLibraries = () => {
    console.log('[App] Back to libraries');
    setSelectedLibrary(null);
    setSelectedMedia(null);
  };

  const handleBackToMediaList = () => {
    console.log('[App] Back to media list');
    setSelectedMedia(null);
  };

  const renderContent = () => {
    if (appState === AppState.LOADING) {
      return <View style={styles.container}><ActivityIndicator size="large" color="#e5a00d" /><Text style={styles.loadingText}>Initializing...</Text></View>;
    }
    if (appState === AppState.ERROR) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorTitle}>Initialization Error</Text>
          <Text style={styles.errorText}>{initError}</Text>
          <Pressable style={styles.retryButton} onPress={initializeApp}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
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

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', padding: 20 },
    loadingText: { marginTop: 20, fontSize: 16, color: '#fff' },
    errorTitle: { fontSize: 24, fontWeight: 'bold', color: '#ff4444', marginBottom: 10 },
    errorText: { fontSize: 14, color: '#fff', textAlign: 'center', lineHeight: 20 },
    retryButton: { marginTop: 20, backgroundColor: '#e5a00d', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
    retryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    downloadsButton: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#e5a00d', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 25, elevation: 5, zIndex: 10 },
    downloadsButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    errorBoundaryContainer: { flex: 1, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', padding: 20 },
    errorBoundaryTitle: { fontSize: 24, fontWeight: 'bold', color: '#ff4444', marginBottom: 10 },
    errorBoundaryMessage: { fontSize: 14, color: '#fff', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
    errorBoundaryButton: { backgroundColor: '#e5a00d', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8 },
    errorBoundaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});