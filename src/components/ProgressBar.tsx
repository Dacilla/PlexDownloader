/**
 * ProgressBar Component
 * A simple visual component to display download progress.
 */
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

interface ProgressBarProps {
  progress: number; // A value between 0 and 100
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { width: `${clampedProgress}%` }]} />
      <Text style={styles.progressText}>{Math.round(clampedProgress)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 20,
    width: '100%',
    backgroundColor: '#333',
    borderRadius: 10,
    marginTop: 8,
    justifyContent: 'center',
    overflow: 'hidden', // Ensures the bar stays within the rounded corners
  },
  bar: {
    height: '100%',
    backgroundColor: '#e5a00d',
    borderRadius: 10,
  },
  progressText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
