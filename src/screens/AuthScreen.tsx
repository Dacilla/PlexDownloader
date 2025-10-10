/**
 * Authentication Screen
 * Manages the PIN-based login flow for Plex authentication.
 */
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, Linking } from 'react-native';
import plexClient from '../api/plexClient';
import { PlexPin } from '../types/plex';
import { setAppState } from '../database/operations';

// Define a key for storing the auth token in the database
export const PLEX_AUTH_TOKEN_KEY = 'plexUserAuthToken';

interface AuthScreenProps {
  onAuthenticationSuccess: (token: string) => void;
}

export default function AuthScreen({ onAuthenticationSuccess }: AuthScreenProps) {
  const [pin, setPin] = useState<PlexPin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Use a ref to manage the polling interval to prevent re-renders from affecting it
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  /**
   * Generates a new PIN from the Plex API.
   */
  const generatePin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const authPin = await plexClient.createAuthPin();
      setPin(authPin);
      startPolling(authPin.id);
    } catch (err) {
      setError('Failed to generate a PIN. Please check your internet connection.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Starts polling the Plex API to check if the PIN has been authenticated.
   */
  const startPolling = (pinId: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const authToken = await plexClient.checkPinStatus(pinId);
        if (authToken) {
          handleAuthenticationSuccess(authToken);
        }
      } catch (err) {
        // Stop polling on error
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setIsPolling(false);
        setError('An error occurred while checking PIN status.');
        console.error(err);
      }
    }, 3000); // Poll every 3 seconds
  };

  /**
   * Handles a successful authentication event.
   */
  const handleAuthenticationSuccess = async (token: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setIsPolling(false);
    setPin(null);

    try {
      // Persist the token to the database
      await setAppState(PLEX_AUTH_TOKEN_KEY, token);
      // Notify the parent component (App.tsx)
      onAuthenticationSuccess(token);
    } catch (err) {
      setError('Failed to save authentication token.');
      console.error(err);
    }
  };

  /**
   * Opens the Plex linking page in the user's browser.
   */
  const openPlexLinkPage = () => {
    Linking.openURL('https://plex.tv/link');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PlexDownloader</Text>
      <Text style={styles.subtitle}>Sign in to your Plex account</Text>
      
      {!pin && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={generatePin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Generate PIN</Text>
          )}
        </Pressable>
      )}

      {pin && (
        <View style={styles.pinContainer}>
          <Text style={styles.instructions}>
            Go to the link below and enter the following code:
          </Text>
          <Pressable onPress={openPlexLinkPage}>
            <Text style={styles.link}>https://plex.tv/link</Text>
          </Pressable>
          <View style={styles.pinBox}>
            <Text style={styles.pinCode}>{pin.code}</Text>
          </View>
          {isPolling && (
            <View style={styles.pollingIndicator}>
              <ActivityIndicator color="#e5a00d" />
              <Text style={styles.pollingText}>Waiting for authentication...</Text>
            </View>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e5a00d',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#e5a00d',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  buttonPressed: {
    backgroundColor: '#c48a0b',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pinContainer: {
    alignItems: 'center',
  },
  instructions: {
    color: '#cccccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 15,
  },
  link: {
    color: '#4f8fcf',
    fontSize: 16,
    textDecorationLine: 'underline',
    marginBottom: 20,
  },
  pinBox: {
    backgroundColor: '#333333',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444444',
  },
  pinCode: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  pollingText: {
    marginLeft: 10,
    color: '#cccccc',
    fontSize: 14,
  },
  errorText: {
    marginTop: 20,
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
    lineHeight: 20,
  },
});
