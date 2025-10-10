/**
 * Media List Screen
 * Fetches and displays all media items within a selected library with search, sort, and filter.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, FlatList, ActivityIndicator, TextInput } from 'react-native';
import { PlexServer, PlexLibrary, PlexMediaBase, PlexMovie, PlexShow } from '../types/plex';
import plexClient from '../api/plexClient';
import LazyImage from '../components/LazyImage';

const PAGE_SIZE = 48;

const SORT_OPTIONS = {
  'Title': { key: 'titleSort', defaultDir: 'asc' },
  'Release Date': { key: 'originallyAvailableAt', defaultDir: 'desc' },
  'Date Added': { key: 'addedAt', defaultDir: 'desc' },
};
type SortOption = keyof typeof SORT_OPTIONS;

const MediaItem = React.memo(({ item, onSelectMedia }: { item: PlexMediaBase, onSelectMedia: (media: PlexMediaBase) => void }) => {
  const thumbnailUrl = item.thumb ? plexClient.getTranscodedImageUrl(item.thumb, 200, 300) : undefined;

  const isMovie = item.type === 'movie';
  const movieItem = item as PlexMovie;
  const showItem = item as PlexShow;
  const year = isMovie ? movieItem.year : showItem.year;

  return (
    <Pressable
      style={({ pressed }) => [styles.mediaItem, pressed && styles.mediaItemPressed]}
      onPress={() => onSelectMedia(item)}
    >
      <LazyImage
        source={{ uri: thumbnailUrl }}
        style={styles.thumbnail}
        resizeMode="cover"
        placeholderText={item.title}
      />
      <View style={styles.mediaInfo}>
        <Text style={styles.mediaTitle} numberOfLines={2}>{item.title}</Text>
        {year && <Text style={styles.mediaYear}>{year}</Text>}
      </View>
    </Pressable>
  );
});

export default function MediaListScreen({
  activeServer,
  selectedLibrary,
  onChangeLibrary,
  onSelectMedia,
}: MediaListScreenProps) {
  const [mediaItems, setMediaItems] = useState<PlexMediaBase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('Title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterUnwatched, setFilterUnwatched] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const loadingRef = useRef(false);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setMediaItems([]);
    setOffset(0);
    setHasMore(true);
    loadingRef.current = false;
    fetchMediaItems(0, true);
  }, [selectedLibrary, debouncedQuery, sortOption, sortDirection, filterUnwatched]);

  const fetchMediaItems = async (currentOffset: number, isInitialLoad = false) => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;

    if (isInitialLoad) setIsLoading(true); else setIsLoadingMore(true);
    setError(null);

    try {
      const sortKey = SORT_OPTIONS[sortOption].key;
      const sortValue = `${sortKey}:${sortDirection}`;
      
      const response = await plexClient.getLibrarySectionItems({
        sectionId: selectedLibrary.key,
        offset: currentOffset,
        limit: PAGE_SIZE,
        sort: sortValue,
        title: debouncedQuery,
        unwatched: filterUnwatched,
      });
      const items = response.MediaContainer.Metadata || [];
      
      if (isInitialLoad && items.length === 0) setError("No items found.");
      if (items.length < PAGE_SIZE) setHasMore(false);
      
      setMediaItems(prev => isInitialLoad ? items : [...prev, ...items]);
      setOffset(currentOffset + items.length);

    } catch (err) {
      setError("Failed to fetch media.");
    } finally {
      if (isInitialLoad) setIsLoading(false);
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  };

  const handleSelectSort = (newSortOption: SortOption) => {
    if (newSortOption === sortOption) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortOption(newSortOption);
      setSortDirection(SORT_OPTIONS[newSortOption].defaultDir);
    }
  };
  
  const handleClearFilters = () => {
      setSearchQuery('');
      setDebouncedQuery('');
      setSortOption('Title');
      setSortDirection('asc');
      setFilterUnwatched(false);
  };

  const handleLoadMore = () => fetchMediaItems(offset);
  
  const renderMediaItem = useCallback(({ item }: { item: PlexMediaBase }) => (
    <MediaItem item={item} onSelectMedia={onSelectMedia} />
  ), [onSelectMedia]);

  const renderFooter = () => (isLoadingMore ? <ActivityIndicator size="small" color="#e5a00d" style={styles.footerLoader} /> : null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{selectedLibrary.title}</Text>
        <Pressable onPress={onChangeLibrary}><Text style={styles.actionButton}>Back</Text></Pressable>
      </View>

      <Pressable onPress={() => setShowControls(!showControls)} style={styles.toggleControlsButton}>
        <Text style={styles.toggleControlsText}>{showControls ? 'Hide' : 'Show'} Filters & Sort</Text>
      </Pressable>

      {showControls && (
        <View style={styles.controlsContainer}>
          <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor="#888" value={searchQuery} onChangeText={setSearchQuery} />
          <View style={styles.row}>
            <Text style={styles.label}>Sort By:</Text>
            {Object.keys(SORT_OPTIONS).map(key => {
              const isActive = sortOption === key;
              return (
                <Pressable key={key} onPress={() => handleSelectSort(key as SortOption)} style={[styles.optionButton, isActive && styles.optionButtonActive]}>
                  <Text style={styles.optionButtonText}>
                    {key} {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
           <View style={styles.row}>
              <Pressable onPress={() => setFilterUnwatched(!filterUnwatched)} style={[styles.optionButton, filterUnwatched && styles.optionButtonActive]}>
                <Text style={styles.optionButtonText}>Unwatched Only</Text>
              </Pressable>
              <Pressable onPress={handleClearFilters} style={[styles.optionButton, styles.clearButton]}>
                <Text style={styles.optionButtonText}>Clear All</Text>
              </Pressable>
           </View>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color="#e5a00d" style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={mediaItems}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.ratingKey}
          numColumns={3}
          contentContainerStyle={styles.listContainer}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          initialNumToRender={18}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#e5a00d', flex: 1, marginRight: 10 },
  actionButton: { fontSize: 14, color: '#4f8fcf' },
  toggleControlsButton: { padding: 10, marginHorizontal: 20, backgroundColor: '#2b2b2b', borderRadius: 8, alignItems: 'center' },
  toggleControlsText: { color: '#e5a00d', fontWeight: 'bold' },
  controlsContainer: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  searchInput: { backgroundColor: '#333', color: '#fff', padding: 10, borderRadius: 8, marginBottom: 15 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  label: { color: '#ccc', marginRight: 10, alignSelf: 'center' },
  optionButton: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#444', borderRadius: 6, marginRight: 8, marginBottom: 8 },
  optionButtonActive: { backgroundColor: '#e5a00d' },
  optionButtonText: { color: '#fff' },
  clearButton: { backgroundColor: '#dc3545' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { textAlign: 'center', fontSize: 16, color: '#ff4444', marginTop: 50, paddingHorizontal: 20 },
  listContainer: { paddingHorizontal: 10, paddingTop: 10 },
  mediaItem: { flex: 1 / 3, margin: 5, backgroundColor: '#2b2b2b', borderRadius: 8, overflow: 'hidden' },
  mediaItemPressed: { opacity: 0.7 },
  thumbnail: { width: '100%', aspectRatio: 2 / 3 },
  mediaInfo: { padding: 8 },
  mediaTitle: { fontSize: 12, color: '#fff', fontWeight: 'bold' },
  mediaYear: { fontSize: 10, color: '#ccc', marginTop: 2 },
  footerLoader: { marginVertical: 20 },
});

