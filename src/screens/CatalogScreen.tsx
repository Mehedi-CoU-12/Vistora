import { useNavigation } from '@react-navigation/native';
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
import { ContentCard } from '../components/ContentCard';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useAsyncData } from '../hooks/useAsyncData';
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
}

/**
 * One tab's catalog: a category filter beside a grid of everything in it.
 *
 * ---------------------------------------------------------------------------
 * Written once, pointed at five queries
 * ---------------------------------------------------------------------------
 * Live TV, Movies, Cartoons, Anime and Sports differ only in which query fills
 * the grid, which categories the filter offers, and whether the artwork is a
 * poster or a 16:9 tile. All three are fields on the `CatalogSpec` this screen
 * is handed (see navigation/tabs.ts), so there is one grid implementation, one
 * set of focus guides, and one place where a bug in any of it can live.
 *
 * ---------------------------------------------------------------------------
 * The two focus guides
 * ---------------------------------------------------------------------------
 * Moving between the halves of a split layout with a D-pad is exactly where TV
 * layouts usually go wrong. The picker owns one (press RIGHT out of the sidebar
 * and enter the grid where you left it); the grid owns the other, below (press
 * LEFT from the first column and return to the category you selected, rather
 * than dropping focus entirely).
 *
 * ---------------------------------------------------------------------------
 * Reloading keeps what it already has
 * ---------------------------------------------------------------------------
 * `isLoading` goes true on a reload as well as on a first load, so rendering the
 * spinner whenever it is set would blank the whole screen on a pull-to-refresh
 * and throw away the scroll position. The spinner is therefore for a FIRST load
 * only -- `data === null` -- and a reload over existing content shows the
 * refresh spinner in place instead.
 *
 * The same test guards the error state, which means a reload that FAILS over
 * content that loaded keeps showing that content rather than replacing a
 * working screen with an error. The cost is that the failure is quiet: the
 * refresh spinner simply stops. That is the better of the two, but it is a
 * trade rather than a free win, and a transient banner is what would fix it
 * properly.
 */
export function CatalogScreen({ tab }: { tab: CatalogTab }) {
  const navigation = useNavigation();
  const metrics = useMetrics();
  const styles = useStyles();
  const { isTouch, usesSidebar } = metrics;

  const spec = tab.catalog;
  const columns = metrics.gridColumns[spec.cardVariant];

  /**
   * Wording for the states, taken from the spec's plural noun rather than from
   * the tab title: "Loading channels" reads correctly where a lowercased title
   * would give "Loading live tv".
   */
  const plural = spec.countNoun[1];

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  /**
   * Whether the grid is still allowed to claim initial focus.
   *
   * The grid is remounted on every category change (see the `key` below), and a
   * fresh mount would re-assert `hasTVPreferredFocus` -- yanking focus out of
   * the sidebar the instant you select a category, so you could never try a
   * second one. We therefore let the grid take focus once, on arrival, and
   * never again.
   */
  const [gridMayClaimFocus, setGridMayClaimFocus] = useState(true);

  /**
   * Measured width of the grid area, used to size cards. Starts at 0 and the
   * grid is not rendered until it is known, so the cards are never laid out at
   * the wrong size and then reflowed -- a reflow would move the focused card out
   * from under the user.
   */
  const [gridWidth, setGridWidth] = useState(0);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);

  const selectCategory = useCallback((categoryId: string | null) => {
    setGridMayClaimFocus(false);
    setSelectedCategoryId(categoryId);
  }, []);

  const { data, isLoading, error, reload } =
    useAsyncData<CatalogData>(async () => {
      const [items, categories] = await Promise.all([
        spec.load(),
        fetchCategories(spec.categoryKind),
      ]);
      return { items, categories };
    }, [spec]);

  // Filtering client-side rather than re-querying: the list is already loaded,
  // and switching categories should be instant. Re-fetching would put a spinner
  // between two presses of the D-pad.
  const visibleItems = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!selectedCategoryId) {
      return data.items;
    }
    return data.items.filter(item => item.categoryId === selectedCategoryId);
  }, [data, selectedCategoryId]);

  const openItem = useCallback(
    (item: ContentItem) => {
      // Not every item is playable -- a fixture whose stream URL has not been
      // published yet has `stream: null`. Guarding here is what keeps the player
      // free of "what if there is no URL" logic.
      if (!item.stream) {
        return;
      }
      navigation.navigate('Player', {
        stream: item.stream,
        title: item.title,
        subtitle: item.subtitle,
      });
    },
    [navigation],
  );

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
        hasTVPreferredFocus={gridMayClaimFocus && index === 0}
      />
    ),
    [cardWidth, gridMayClaimFocus, openItem, spec.cardVariant],
  );

  /**
   * Row height has to follow the measured card, not the theme's row-card size:
   * the grid divides its own width, so its cards are a different size from the
   * ones a horizontal shelf gets. The extra `spacing.xl` leaves room for the
   * focus ring and the scale-up.
   */
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

  /**
   * Pull-to-refresh, on a finger only. A remote has no gesture for it, and the
   * control would be a spinner nothing on a TV could ever trigger.
   */
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

  // First load: nothing to keep on screen, so the spinner owns it.
  if (isLoading && data === null) {
    return (
      <View style={styles.screen}>
        {header}
        <LoadingState label={`Loading ${plural}…`} />
      </View>
    );
  }

  if (error && data === null) {
    return (
      <View style={styles.screen}>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </View>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          title={`No ${plural}`}
          message={spec.emptyMessage}
          // The message above says to go and import something; this is what you
          // press when you have.
          action={{ label: 'Reload', onPress: reload }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}

      {/* `usesSidebar` decides the axis here and the picker's own shape inside
          `CategoryPicker`. Two reads of one metric rather than a prop, so the
          two cannot disagree about which way round the layout is. */}
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
          {visibleItems.length === 0 ? (
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
              // Remounting on category change resets scroll position to the top,
              // which is what you want: keeping the old offset would leave the
              // user staring at blank space in a shorter list.
              //
              // The column count is in the key because FlatList cannot change
              // `numColumns` in place -- and it does change, the moment a phone
              // is rotated.
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
              // Recycling views out from under the focus engine causes focus to
              // jump to the top of the screen. Cards are cheap; keep them
              // mounted.
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
  // Read from the same helper the card-width calculation is handed, so the
  // padding the grid actually renders and the padding subtracted to size a card
  // cannot drift apart.
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
      // Grid rows are left-aligned so a partially filled last row does not
      // centre its cards under the full rows above.
      justifyContent: 'flex-start' as const,
    },
  };
});
