/**
 * Server List Screen
 * Fetches and displays the user's available Plex servers after authentication.
 */
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { PlexServer, PlexConnection } from '../types/plex';
import plexClient from '../api/plexClient';
import { saveServer, ServerRecord } from '../database/operations';

interface ServerListScreenProps {
  onLogout: () => void;
  onServerSelect: (server: PlexServer) => void;
}

function getBestConnectionUri(connections: PlexConnection[]): string {
  const remoteHttps = connections.find(c => !c.local && c.protocol === 'https');
  if (remoteHttps) return remoteHttps.uri;

  const remoteHttp = connections.find(c => !c.local && c.protocol === 'http');
  if (remoteHttp) return remoteHttp.uri;

  return connections[0]?.uri || '';
}

export default function ServerListScreen({ onLogout, onServerSelect }: ServerListScreenProps) {
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedServers = await plexClient.getServers();
      
      console.log('Fetched servers:', fetchedServers.length);
      fetchedServers.forEach(s => {
        console.log(`Server: ${s.name}, Connections:`, s.connections.length);
        s.connections.forEach(c => {
          console.log(`  - ${c.protocol}://${c.address}:${c.port} (${c.local ? 'local' : 'remote'})`);
        });
      });
      
      if (fetchedServers.length === 0) {
        setError("No servers found on your Plex account.");
      }
      setServers(fetchedServers);
    } catch (err) {
      console.error('Error fetching servers:', err);
      setError("Failed to fetch servers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleServerPress = async (server: PlexServer) => {
    try {
      const bestUri = getBestConnectionUri(server.connections);
      console.log(`Selected server: ${server.name}, URI: ${bestUri}, Token: ${server.accessToken?.substring(0, 10)}...`);
      
      const serverToSave: Omit<ServerRecord, 'last_connected'> = {
        server_identifier: server.machineIdentifier,
        name: server.name,
        access_token: server.accessToken,
        base_url: bestUri,
        owned: server.owned ? 1 : 0,
        cached_metadata_json: JSON.stringify({ ...server, host: bestUri }),
      };
      
      await saveServer(serverToSave);
      
      const serverWithHost: PlexServer = {
        ...server,
        host: bestUri
      };
      
      console.log('Calling onServerSelect with server:', serverWithHost.name);
      onServerSelect(serverWithHost);
    } catch (err) {
      console.error('Error selecting server:', err);
      setError('Failed to select server. Please try again.');
    }
  };

  const renderServerItem = ({ item }: { item: PlexServer }) => {
    const bestUri = getBestConnectionUri(item.connections);
    return (
      <Pressable
        style={({ pressed }) => [styles.serverItem, pressed && styles.serverItemPressed]}
        onPress={() => handleServerPress(item)}
      >
        <Text style={styles.serverName}>{item.name}</Text>
        <Text style={styles.serverAddress}>{bestUri}</Text>
        <Text style={styles.serverInfo}>
          {item.connections.length} connection{item.connections.length !== 1 ? 's' : ''} available
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select a Server</Text>
        <Pressable onPress={onLogout}>
          <Text style={styles.logoutButton}>Log Out</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#e5a00d" style={styles.loader} />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable 
            style={styles.retryButton}
            onPress={fetchServers}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={servers}
          renderItem={renderServerItem}
          keyExtractor={(item) => item.machineIdentifier}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e5a00d',
  },
  logoutButton: {
    fontSize: 16,
    color: '#4f8fcf',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  serverItem: {
    backgroundColor: '#2b2b2b',
    padding: 20,
    borderRadius: 8,
    marginBottom: 10,
  },
  serverItemPressed: {
    backgroundColor: '#3c3c3c',
  },
  serverName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  serverAddress: {
    fontSize: 14,
    color: '#cccccc',
    marginTop: 5,
  },
  serverInfo: {
    fontSize: 12,
    color: '#999999',
    marginTop: 3,
  },
});