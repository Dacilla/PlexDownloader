/**
 * LazyImage Component
 * A wrapper for the standard Image component that shows a placeholder with text,
 * and fades in the image when it has loaded. Now supports local caching.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

interface LazyImageProps {
  source: { uri: string | undefined };
  localPath?: string | null;
  style: any;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
  placeholderText?: string;
}

export default function LazyImage({ source, localPath, style, resizeMode, placeholderText }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imageSource, setImageSource] = useState<{ uri: string | undefined }>({ uri: undefined });
  const imageOpacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    loadImage();
  }, [source.uri, localPath]);

  const loadImage = async () => {
    if (localPath) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
          setImageSource({ uri: localPath });
          return;
        }
      } catch (error) {
        console.warn('[LazyImage] Failed to check local path:', error);
      }
    }
    
    setImageSource(source);
  };

  const onImageLoad = () => {
    if (!hasError) {
      setIsLoaded(true);
      Animated.timing(imageOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  };

  const onImageError = (error: any) => {
    setHasError(true);
  };

  const shouldShowImage = imageSource.uri && !hasError;

  return (
    <View style={[styles.container, style]}>
      {!isLoaded && placeholderText && (
        <Text style={styles.placeholderText} numberOfLines={4}>
          {placeholderText}
        </Text>
      )}

      {shouldShowImage && (
        <Animated.Image
          source={imageSource}
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
    padding: 8,
  },
});