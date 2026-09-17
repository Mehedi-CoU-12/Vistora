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
import { RailList } from '../components/RailList';
import { SkeletonScreen } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
import { useOpenItem } from '../hooks/useOpenItem';
import { usePlayItem } from '../hooks/usePlayItem';
import {
  buildRails,
  pickFeatured,
  withGenre,
  type Rail,
} from '../navigation/rails';
import { formatCount, type CatalogTab } from '../navigation/tabs';
import { fetchCategories } from '../services/contentService';
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
import type { Category, ContentItem } from '../types/content';

interface CatalogData {
  items: ContentItem[];
  categories: Category[];
  
  rails: Rail[];
  featured: ContentItem | null;
}









const SESSION_SEED = Math.floor(Math.random() * 100_000);































































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

  const selectCategory = useCallback((categoryId: string | null) => {
    setContentMayClaimFocus(false);
    setSelectedCategoryId(categoryId);
  }, []);

  const { data, isLoading, error, reload } =
    useAsyncData<CatalogData>(async () => {
      const [loaded, categories] = await Promise.all([
        spec.load(),
        fetchCategories(spec.categoryKind),
      ]);

      
      
      
      const items = withGenre(loaded, categories);

      return {
        items,
        categories,
        rails: buildRails({
          items,
          categories,
          cardVariant: spec.cardVariant,
          fallbackTitle: tab.title,
          idPrefix: tab.id,
        }),
        featured: pickFeatured(items, SESSION_SEED),
      };
    }, [spec, tab.id, tab.title]);

  
  
  
  const visibleItems = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!selectedCategoryId) {
      return data.items;
    }
    return data.items.filter(item => item.categoryId === selectedCategoryId);
  }, [data, selectedCategoryId]);

  const openItem = useOpenItem();
  const playItem = usePlayItem();

  
  const chromeInset = useChromeInset();

  







  const showRails =
    selectedCategoryId === null && (data?.rails.length ?? 0) > 1;

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
      refreshing={isLoading && data !== null}
      onRefresh={reload}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.surface}
    />
  ) : undefined;

  








  const header = (
    <AppHeader
      title={tab.title}
      subtitle={
        data ? formatCount(visibleItems.length, spec.countNoun) : undefined
      }
    />
  );

  










  if (isLoading && data === null) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        <SkeletonScreen rows={2} variant={spec.cardVariant} />
      </View>
    );
  }

  if (error && data === null) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: chromeInset }]}>
        {header}
        <EmptyState
          title={`No ${plural}`}
          message={spec.emptyMessage}
          
          
          action={{ label: 'Reload', onPress: reload }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: chromeInset }]}>
      {
}
      {showRails ? null : header}

      {

}
      <View style={usesSidebar ? styles.splitRow : styles.splitColumn}>
        <CategoryPicker
          categories={data.categories}
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
              rails={data.rails}
              featured={data.featured}
              heroEyebrow={tab.title}
              onPlay={playItem}
              onSelectItem={openItem}
              onRefresh={reload}
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
              refreshControl={refreshControl}
              
              
              
              removeClippedSubviews={false}
            />
          )}
        </TVFocusGuideView>
      </View>
    </View>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

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
