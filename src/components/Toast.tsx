/**
 * Toast Component
 * A simple, non-interactive notification that appears and fades out.
 */
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, Animated } from 'react-native';

interface ToastProps {
  message: string;
  duration?: number;
  onHide: () => void;
}

export default function Toast({ message, duration = 3000, onHide }: ToastProps) {
  // Animated value for the opacity
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Sequence to fade in, wait, then fade out
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(duration),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide(); // Notify parent component to remove the toast
    });
  }, [message, duration, onHide, fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim, // Bind opacity to the animated value
        },
      ]}
    >
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  message: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
});
