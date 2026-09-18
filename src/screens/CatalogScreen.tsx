import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  TVFocusGuideView,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { AppHeader } from '../components/AppHeader';
import { CategoryPicker } from '../components/CategoryPicker';
import { useChromeInset } from '../components/ChromeInset';
import { ContentCard } from '../components/ContentCard';
import { GridFooter } from '../components/GridFooter';
import { RailList } from '../components/RailList';
import { SkeletonScreen } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useOpenItem } from '../hooks/useOpenItem';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { usePlayItem } from '../hooks/usePlayItem';
import { buildRails, pickFeatured, withGenre } from '../navigation/rails';
import { formatPartialCount, type CatalogTab } from '../navigation/tabs';
import { fetchCategories } from '../services/contentService';
import { clearHomeCache } from '../services/moviebox/catalogue';
import { deriveGenres, filterByCategory } from '../services/genres';
import {
  cardAspect,
  colors,
  COLUMN_GAP,
  computeCardWidth,
  gridPadding,
  makeStyles,
  spacing,
  useMetrics,
} from '../theme';
import type { ContentItem } from '../types/content';

const SESSION_SEED = Math.floor(Math.random() * 100_000);

/**
 * How far from the bottom of the grid a scroll starts the next page, as a
 * fraction of the visible height.
 */
const END_REACHED_THRESHOLD = 1.2;

const keyExtractor = (item: ContentItem) => item.id;

const identify = (item: ContentItem) => item.id;

export function CatalogScreen({ tab }: { tab: CatalogTab }) {
  const metrics = useMetrics();
  const styles = useStyles();
  const { isTouch, usesSidebar } = metrics;

  const spec = tab.catalog;
  const columns = metrics.gridColumns[spec.cardVariant];

  const plural = spec.countNoun[1];

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const [contentMayClaimFocus, setContentMayClaimFocus] = useState(true);

  const [gridWidth, setGridWidth] = useState(0);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);

  /** Categories that live in our own table. Empty for the MovieBox tabs. */
  const { data: storedCategories } = useAsyncData(
    () => fetchCategories(spec.categoryKind),
    [spec.categoryKind],
  );

  const loadPage = useCallback(
    (cursor: Parameters<typeof spec.loadPage>[0], seen: ReadonlySet<string>) =>
      spec.loadPage(cursor, seen),
    [spec],
  );

  const {
    items,
    isLoading,
    isLoadingMore,
    error,
    moreError,
    hasMore,
    loadMore,
    reload,
  } = usePaginatedData(loadPage, identify, [tab.id]);

  const categories = useMemo(() => {
    const stored = storedCategories ?? [];

    // The MovieBox tabs have no rows in `categories`, so their chips come from
    // the genres the loaded items actually carry.
    return stored.length > 0 ? stored : deriveGenres(items, spec.categoryKind);
  }, [items, spec.categoryKind, storedCategories]);

  const withGenres = useMemo(
    () => withGenre(items, storedCategories ?? []),
    [items, storedCategories],
  );

  const visibleItems = useMemo(
    () => filterByCategory(withGenres, selectedCategoryId),
    [selectedCategoryId, withGenres],
  );

  const rails = useMemo(() => {
    const stored = storedCategories ?? [];

    // Rails only make sense for a source whose items carry a category id;
    // the keyword-paged tabs are a flat grid.
    if (stored.length === 0) {
      return [];
    }

    return buildRails({
      items: withGenres,
      categories: stored,
      cardVariant: spec.cardVariant,
      fallbackTitle: tab.title,
      idPrefix: tab.id,
    });
  }, [spec.cardVariant, storedCategories, tab.id, tab.title, withGenres]);

  const featured = useMemo(
    () => pickFeatured(withGenres, SESSION_SEED),
    [withGenres],
  );

  const selectCategory = useCallback((categoryId: string | null) => {
    setContentMayClaimFocus(false);
    setSelectedCategoryId(categoryId);

    // No scroll reset needed: the grid is keyed by category, so picking one
    // remounts the list at the top.
  }, []);

  const openItem = useOpenItem();
  const playItem = usePlayItem();

  // The curated payload that seeds the first page is cached for the session,
  // so a refresh has to drop it to be a real refresh.
  const refresh = useCallback(() => {
    clearHomeCache();
    reload();
  }, [reload]);

  const chromeInset = useChromeInset();

  const showRails = selectedCategoryId === null && rails.length > 1;

  const cardWidth =
    gridWidth > 0
      ? computeCardWidth(gridWidth, columns, gridPadding(metrics))
      : 0;

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => (
      <ContentCard
        item={item}
        variant={spec.cardVariant}
        width={cardWidth}
        onPress={openItem}
        hasTVPreferredFocus={contentMayClaimFocus && index === 0}
      />
    ),
    [cardWidth, contentMayClaimFocus, openItem, spec.cardVariant],
  );

  const columnWrapperStyle = useMemo(
    () => [
      styles.gridRow,
      {
        minHeight:
          Math.floor(cardWidth * cardAspect[spec.cardVariant]) + spacing.xl,
      },
    ],
    [cardWidth, spec.cardVariant, styles.gridRow],
  );

  const refreshControl = isTouch ? (
    <RefreshControl
      refreshing={isLoading && items.length > 0}
      onRefresh={refresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  ) : undefined;

  /**
   * Paging works off the unfiltered pool, so a narrow genre filter would hit
   * the end of its own short list at once and pull page after page. While a
   * filter is on, the footer button drives paging instead.
   */
  const handleEndReached = useCallback(() => {
    if (selectedCategoryId === null) {
      loadMore();
    }
  }, [loadMore, selectedCategoryId]);

  const footer = (
    <GridFooter
      isLoadingMore={isLoadingMore}
      hasMore={hasMore}
      moreError={moreError}
      onLoadMore={loadMore}
      itemCount={visibleItems.length}
      noun={plural}
      filtered={selectedCategoryId !== null}
    />
  );

  const header = (
    <AppHeader
      title={tab.title}
      subtitle={
        items.length > 0
          ? formatPartialCount(
              visibleItems.length,
              spec.countNoun,
              hasMore && selectedCategoryId === null,
            )
          : undefined
      }
    />
  );

  if (isLoading && items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        <SkeletonScreen rows={2} variant={spec.cardVariant} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <ErrorState error={error} onRetry={refresh} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <EmptyState
          title={`No ${plural}`}
          message={spec.emptyMessage}
          action={{ label: 'Reload', onPress: refresh }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: chromeInset }]}>
      {}
      {showRails ? null : header}

      {}
      <View style={usesSidebar ? styles.splitRow : styles.splitColumn}>
        <CategoryPicker
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelect={selectCategory}
        />

        <TVFocusGuideView
          autoFocus
          style={styles.gridArea}
          onLayout={handleGridLayout}
        >
          {showRails ? (
            <RailList
              rails={rails}
              featured={featured}
              heroEyebrow={tab.title}
              onPlay={playItem}
              onSelectItem={openItem}
              onRefresh={refresh}
              refreshing={isLoading}
              heroClaimsFocus={contentMayClaimFocus}
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="Nothing in this category"
              message={
                usesSidebar
                  ? 'Pick another category from the left.'
                  : 'Pick another category from the row above.'
              }
            />
          ) : cardWidth <= 0 ? null : (
            <FlatList
              key={`${selectedCategoryId ?? 'all'}-${columns}`}
              data={visibleItems}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              numColumns={columns}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={columnWrapperStyle}
              showsVerticalScrollIndicator={false}
              initialNumToRender={columns * 3}
              windowSize={7}
              refreshControl={refreshControl}
              removeClippedSubviews={false}
              onEndReached={handleEndReached}
              onEndReachedThreshold={END_REACHED_THRESHOLD}
              ListFooterComponent={footer}
            />
          )}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const useStyles = makeStyles(m => {
  const padding = gridPadding(m);

  return {
    screen: {
      flex: 1,
    },
    splitRow: {
      flex: 1,
      flexDirection: 'row',
    },
    splitColumn: {
      flex: 1,
      flexDirection: 'column',
    },
    gridArea: {
      flex: 1,
    },
    gridContent: {
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingBottom: m.gutter.vertical + spacing.lg,
    },
    gridRow: {
      gap: COLUMN_GAP,
      marginBottom: spacing.md,

      justifyContent: 'flex-start' as const,
    },
  };
});
