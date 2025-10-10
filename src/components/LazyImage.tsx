/**
 * LazyImage Component
 * A wrapper for the standard Image component that shows a placeholder with text,
 * and fades in the image when it has loaded.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface LazyImageProps {
  source: { uri: string | undefined };
  style: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  placeholderText?: string; // New prop for the title
}

export default function LazyImage({ source, style, resizeMode, placeholderText }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imageOpacity = useState(new Animated.Value(0))[0];

  const onImageLoad = () => {
    if (!hasError) {
      setIsLoaded(true); // Mark as loaded to hide placeholder text
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const onImageError = () => {
    setHasError(true);
  };

  const shouldShowImage = source.uri && !hasError;

  return (
    <View style={[styles.container, style]}>
      {/* Show placeholder text only if the image hasn't loaded yet */}
      {!isLoaded && placeholderText && (
        <Text style={styles.placeholderText} numberOfLines={4}>
          {placeholderText}
        </Text>
      )}

      {shouldShowImage && (
        <Animated.Image
          source={source}
          style={[styles.image, { opacity: imageOpacity }]}
          onLoad={onImageLoad}
          onError={onImageError}
          resizeMode={resizeMode}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  placeholderText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    padding: 8, // Give it some space from the edges
  },
});

