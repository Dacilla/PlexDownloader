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

export default function ServerListScreen({ onLogout, onServerSelect }: ServerListScreenProps) {
  const [servers, setServers] = useState<PlexServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, Record<string, number>>>({});
  const [bestConnections, setBestConnections] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedServers = await plexClient.getServers();
      
      if (fetchedServers.length === 0) {
        setError("No servers found on your Plex account.");
      }
      setServers(fetchedServers);
      
      // Trigger connection tests for all servers
      fetchedServers.forEach(testServerConnections);
    } catch (err) {
      console.error('Error fetching servers:', err);
      setError("Failed to fetch servers. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const testServerConnections = async (server: PlexServer) => {
    console.log(`Testing connections for ${server.name}...`);
    
    const results: Record<string, number> = {};
    let bestLatency = Infinity;
    let bestUri = '';

    // Initialize status for this server
    setConnectionStatuses(prev => ({
      ...prev,
      [server.machineIdentifier]: {}
    }));

    await Promise.all(server.connections.map(async (conn) => {
      // Set initial status to -2 (testing)
      setConnectionStatuses(prev => ({
        ...prev,
        [server.machineIdentifier]: {
          ...(prev[server.machineIdentifier] || {}),
          [conn.uri]: -2
        }
      }));

      const latency = await plexClient.testConnection(conn.uri, server.accessToken);
      results[conn.uri] = latency;
      
      if (latency !== -1 && latency < bestLatency) {
        bestLatency = latency;
        bestUri = conn.uri;
      }

      // Update status with result
      setConnectionStatuses(prev => ({
        ...prev,
        [server.machineIdentifier]: {
          ...(prev[server.machineIdentifier] || {}),
          [conn.uri]: latency
        }
      }));
    }));

    if (bestUri) {
      setBestConnections(prev => ({
        ...prev,
        [server.machineIdentifier]: bestUri
      }));
    }
  };

  const handleServerPress = async (server: PlexServer) => {
    try {
      // Use the best connection found during testing, or fall back to the first one
      const bestUri = bestConnections[server.machineIdentifier];
      
      if (!bestUri) {
        // If no best connection found yet (still testing or all failed), try to find one now
        const best = await plexClient.findBestConnection(server.connections, server.accessToken);
        if (!best) {
             throw new Error("Could not find a reachable connection for this server.");
        }
        plexClient.setActiveServerConnection(server, best.uri);
      } else {
        plexClient.setActiveServerConnection(server, bestUri);
      }

      const activeUrl = plexClient.getActiveServerUrl();
      
      if (!activeUrl) {
        throw new Error("Could not determine valid server connection URL");
      }

      console.log(`Selected server: ${server.name}, URI: ${activeUrl}`);
      
      const serverToSave: Omit<ServerRecord, 'last_connected'> = {
        server_identifier: server.machineIdentifier,
        name: server.name,
        access_token: server.accessToken,
        base_url: activeUrl,
        owned: server.owned ? 1 : 0,
        cached_metadata_json: JSON.stringify({ ...server, host: activeUrl }),
      };
      
      await saveServer(serverToSave);
      
      const serverWithHost: PlexServer = {
        ...server,
        host: activeUrl
      };
      
      onServerSelect(serverWithHost);
    } catch (err) {
      console.error('Error selecting server:', err);
      setError('Failed to connect to server. Please check your connection and try again.');
    }
  };

  const handleConnectionSelect = async (server: PlexServer, connection: PlexConnection) => {
    try {
      console.log(`Manual connection selected: ${server.name}, URI: ${connection.uri}`);
      
      // Save with the specific connection URI
      const serverToSave: Omit<ServerRecord, 'last_connected'> = {
        server_identifier: server.machineIdentifier,
        name: server.name,
        access_token: server.accessToken,
        base_url: connection.uri,
        owned: server.owned ? 1 : 0,
        cached_metadata_json: JSON.stringify({ ...server, host: connection.uri }),
      };
      
      await saveServer(serverToSave);
      
      // Use the new method on plexClient
      plexClient.setActiveServerConnection(server, connection.uri);
      
      const serverWithHost: PlexServer = {
        ...server,
        host: connection.uri
      };
      
      onServerSelect(serverWithHost);
    } catch (err) {
      console.error('Error selecting connection:', err);
      setError('Failed to select connection. Please try again.');
    }
  };

  const toggleServerExpansion = (server: PlexServer) => {
    setExpandedServerId(expandedServerId === server.machineIdentifier ? null : server.machineIdentifier);
  };

  const renderServerItem = ({ item }: { item: PlexServer }) => {
    const isExpanded = expandedServerId === item.machineIdentifier;
    const bestUri = bestConnections[item.machineIdentifier];
    const statuses = connectionStatuses[item.machineIdentifier] || {};
    
    // Count working connections
    const workingCount = Object.values(statuses).filter(s => s > -1).length;
    const isTesting = Object.values(statuses).some(s => s === -2);
    
    return (
      <View style={styles.serverItemContainer}>
        <Pressable
          style={({ pressed }) => [styles.serverItem, pressed && styles.serverItemPressed]}
          onPress={() => handleServerPress(item)}
        >
          <View style={styles.serverHeader}>
            <View style={styles.serverInfoContainer}>
                <Text style={styles.serverName}>{item.name}</Text>
                <Text style={styles.serverAddress} numberOfLines={1} ellipsizeMode="middle">
                  {bestUri ? bestUri : (isTesting ? 'Testing connections...' : 'No reachable connection')}
                </Text>
                <Text style={styles.serverInfo}>
                  {workingCount} reachable / {item.connections.length} total
                </Text>
            </View>
            <Pressable 
                style={styles.expandButton}
                onPress={(e) => {
                    e.stopPropagation();
                    toggleServerExpansion(item);
                }}
            >
                <Text style={styles.expandButtonText}>{isExpanded ? 'Hide' : 'Connections'}</Text>
            </Pressable>
          </View>
        </Pressable>
        
        {isExpanded && (
            <View style={styles.connectionsList}>
                <Text style={styles.connectionsTitle}>Select Connection Override:</Text>
                {item.connections.map((conn, index) => {
                    const latency = statuses[conn.uri];
                    const isBest = conn.uri === bestUri;
                    let statusText = '';
                    let statusColor = '#999';

                    if (latency === -2) {
                        statusText = 'Testing...';
                        statusColor = '#e5a00d';
                    } else if (latency === -1) {
                        statusText = 'Unreachable';
                        statusColor = '#ff4444';
                    } else if (latency !== undefined) {
                        statusText = `${latency}ms`;
                        statusColor = latency < 100 ? '#4caf50' : '#e5a00d';
                    }

                    return (
                        <Pressable
                            key={index}
                            style={({ pressed }) => [
                                styles.connectionItem, 
                                pressed && styles.connectionItemPressed,
                                isBest && styles.bestConnectionItem
                            ]}
                            onPress={() => handleConnectionSelect(item, conn)}
                        >
                            <View style={styles.connectionHeader}>
                                <Text style={styles.connectionUri} numberOfLines={1} ellipsizeMode="middle">
                                    {conn.uri}
                                </Text>
                                <Text style={[styles.connectionStatus, { color: statusColor }]}>
                                    {statusText}
                                </Text>
                            </View>
                            <Text style={styles.connectionDetails}>
                                {conn.protocol} • {conn.address} • {conn.local ? 'Local' : 'Remote'}
                                {isBest && ' (Best)'}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        )}
      </View>
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
    paddingBottom: 40,
  },
  serverItemContainer: {
    marginBottom: 10,
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    overflow: 'hidden',
  },
  serverItem: {
    padding: 20,
  },
  serverItemPressed: {
    backgroundColor: '#3c3c3c',
  },
  serverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serverInfoContainer: {
    flex: 1,
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
  expandButton: {
    padding: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    marginLeft: 10,
  },
  expandButtonText: {
    color: '#e5a00d',
    fontSize: 12,
    fontWeight: 'bold',
  },
  connectionsList: {
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 10,
  },
  connectionsTitle: {
    color: '#999',
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 5,
  },
  connectionItem: {
    padding: 12,
    backgroundColor: '#2a2a2a',
    marginBottom: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  connectionItemPressed: {
    backgroundColor: '#3a3a3a',
    borderColor: '#e5a00d',
  },
  connectionUri: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 2,
    flex: 1,
  },
  connectionDetails: {
    color: '#888',
    fontSize: 12,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  connectionStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  bestConnectionItem: {
    borderColor: '#4caf50',
    backgroundColor: '#1e3320',
  },
});