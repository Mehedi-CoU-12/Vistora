import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useMemo, useState} from 'react';
import {
  FlatList,
  ScrollView,
  Text,
  TVFocusGuideView,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import {AppHeader} from '../components/AppHeader';
import {ContentCard} from '../components/ContentCard';
import {ScreenContainer} from '../components/ScreenContainer';
import {EmptyState, ErrorState, LoadingState} from '../components/StateViews';
import {Focusable} from '../components/Focusable';
import {useAsyncData} from '../hooks/useAsyncData';
import {fetchCategories, fetchChannels} from '../services/contentService';
import {
  cardAspect,
  cardChrome,
  colors,
  makeStyles,
  radius,
  spacing,
  useMetrics,
  type Metrics,
} from '../theme';
import type {Category, ContentItem} from '../types/content';

const COLUMN_GAP = spacing.md;

/**
 * Horizontal padding inside the grid.
 *
 * With a sidebar, the sidebar's own right padding already separates the two
 * halves, so the grid needs only enough on the left to clear a card's padding.
 * Without one, the grid is the full width of the screen and takes the gutter on
 * both sides like everything else.
 *
 * These MUST match what `computeCardWidth` subtracts, which is why both read
 * from here rather than from a pair of constants that can drift apart.
 */
function gridPadding(m: Metrics): {left: number; right: number} {
  return m.usesSidebar
    ? {left: spacing.sm, right: m.gutter.horizontal}
    : {left: m.gutter.horizontal, right: m.gutter.horizontal};
}

/**
 * Divides the measured grid width into exactly `columns` cards.
 *
 * The cards are FLUID rather than a fixed size, which matters more than it
 * sounds. With a fixed card width, whether the last column fits depends on the
 * screen width, the sidebar width and the padding all agreeing -- and when they
 * do not, the final column is clipped off the right edge. A clipped card on a TV
 * is worse than an ugly one: the D-pad will still move focus onto it, so the
 * user's selection vanishes off-screen with no way to see what is highlighted.
 *
 * Computing the width instead means the row always fills the space exactly, on
 * any panel and at any window size -- which is now load-bearing for a second
 * reason: a phone rotated from portrait to landscape changes both the width and
 * the column count in the same frame.
 */
function computeCardWidth(
  gridWidth: number,
  columns: number,
  padding: {left: number; right: number},
): number {
  const usable = gridWidth - padding.left - padding.right - COLUMN_GAP * (columns - 1);
  return Math.floor(usable / columns) - cardChrome;
}

interface LiveTvData {
  channels: ContentItem[];
  categories: Category[];
}

/**
 * The full Live TV browser: a category picker plus a channel grid.
 *
 * ---------------------------------------------------------------------------
 * The category picker changes shape; the grid only changes column count
 * ---------------------------------------------------------------------------
 * On anything with room -- a TV, a tablet, a phone held sideways -- categories
 * are a sidebar down the left. That is the right shape when it fits, because it
 * costs nothing vertically and shows every category at once.
 *
 * On a phone in portrait it does not fit. A 176dp sidebar out of 390dp is not a
 * sidebar, it is half the screen, and it would leave the grid too narrow for two
 * columns of 16:9 artwork. So below `SIDEBAR_MIN_CONTENT_WIDTH` (see
 * `theme/metrics.ts`) the same categories become a horizontal chip rail above
 * the grid: one row of vertical space in exchange for the full width.
 *
 * Note the test is on available width, not on device class. A phone in landscape
 * has 796dp of content width and passes it -- and *should*, because vertical
 * space is what that window is short of, so a picker that costs no height is
 * exactly what it wants.
 *
 * ---------------------------------------------------------------------------
 * The two focus guides
 * ---------------------------------------------------------------------------
 * Moving between the halves of the split layout with a D-pad is exactly where TV
 * layouts usually go wrong. Two `TVFocusGuideView`s with `autoFocus` fix it:
 *
 *   Sidebar guide -- pressing RIGHT out of the sidebar enters the grid at the
 *   card you last had focused, not back at the top-left.
 *
 *   Grid guide -- pressing LEFT from the grid's first column returns to the
 *   category you last selected, rather than dropping focus entirely.
 *
 * Without them, focus at the boundary depends on raw screen geometry, and
 * "left" from a card in the middle of the grid may find nothing at all.
 */
export function LiveTvScreen() {
  const navigation = useNavigation();
  const metrics = useMetrics();
  const styles = useStyles();
  const {gridColumns, usesSidebar} = metrics;

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

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

  const {data, isLoading, error, reload} = useAsyncData<LiveTvData>(async () => {
    const [channels, categories] = await Promise.all([
      fetchChannels(),
      fetchCategories('live_tv'),
    ]);
    return {channels, categories};
  }, []);

  // Filtering client-side rather than re-querying: the channel list is small,
  // already loaded, and switching categories should be instant. Re-fetching
  // would put a spinner between two presses of the D-pad.
  const visibleChannels = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!selectedCategoryId) {
      return data.channels;
    }
    return data.channels.filter(channel => channel.categoryId === selectedCategoryId);
  }, [data, selectedCategoryId]);

  const openChannel = useCallback(
    (item: ContentItem) => {
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
    gridWidth > 0 ? computeCardWidth(gridWidth, gridColumns, gridPadding(metrics)) : 0;

  const renderChannel = useCallback(
    ({item, index}: {item: ContentItem; index: number}) => (
      <ContentCard
        item={item}
        variant="landscape"
        width={cardWidth}
        onPress={openChannel}
        hasTVPreferredFocus={gridMayClaimFocus && index === 0}
      />
    ),
    [cardWidth, gridMayClaimFocus, openChannel],
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
      {minHeight: Math.floor(cardWidth * cardAspect.landscape) + spacing.xl},
    ],
    [cardWidth, styles.gridRow],
  );

  if (isLoading) {
    return (
      <ScreenContainer>
        <AppHeader title="Live TV" />
        <LoadingState label="Loading channels…" />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <AppHeader title="Live TV" />
        <ErrorState error={error} onRetry={reload} />
      </ScreenContainer>
    );
  }

  if (!data || data.channels.length === 0) {
    return (
      <ScreenContainer>
        <AppHeader title="Live TV" />
        <EmptyState
          title="No channels"
          message="No active channels were returned. Add rows to the `channels` table, or apply supabase/seed.sql."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <AppHeader
        title="Live TV"
        subtitle={`${visibleChannels.length} channel${
          visibleChannels.length === 1 ? '' : 's'
        }`}
      />

      <View style={usesSidebar ? styles.splitRow : styles.splitColumn}>
        {usesSidebar ? (
          <CategorySidebar
            categories={data.categories}
            selectedCategoryId={selectedCategoryId}
            onSelect={selectCategory}
          />
        ) : (
          <CategoryRail
            categories={data.categories}
            selectedCategoryId={selectedCategoryId}
            onSelect={selectCategory}
          />
        )}

        <TVFocusGuideView autoFocus style={styles.gridArea} onLayout={handleGridLayout}>
          {visibleChannels.length === 0 ? (
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
              key={`${selectedCategoryId ?? 'all'}-${gridColumns}`}
              data={visibleChannels}
              renderItem={renderChannel}
              keyExtractor={keyExtractor}
              numColumns={gridColumns}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={columnWrapperStyle}
              showsVerticalScrollIndicator={false}
              initialNumToRender={gridColumns * 3}
              removeClippedSubviews={false}
            />
          )}
        </TVFocusGuideView>
      </View>
    </ScreenContainer>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

interface CategoryPickerProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

/** Categories down the left, for any window wide enough to spare the width. */
function CategorySidebar({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    <TVFocusGuideView autoFocus style={styles.sidebar}>
      <Text style={styles.sidebarHeading}>CATEGORIES</Text>

      <CategoryButton
        label="All"
        selected={selectedCategoryId === null}
        onPress={() => onSelect(null)}
      />

      {categories.map(category => (
        <CategoryButton
          key={category.id}
          label={category.name}
          selected={selectedCategoryId === category.id}
          onPress={() => onSelect(category.id)}
        />
      ))}
    </TVFocusGuideView>
  );
}

/**
 * Categories as a scrolling chip rail, for a phone in portrait.
 *
 * Only ever rendered on a touch device -- `usesSidebar` is unconditionally true
 * on TV -- so it needs no focus guide and no focus memory. It does need the
 * chips to stay a full touch target tall, which is why they carry a `minHeight`
 * rather than relying on padding the way the sidebar rows do.
 */
function CategoryRail({categories, selectedCategoryId, onSelect}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
      style={styles.rail}>
      <CategoryChip
        label="All"
        selected={selectedCategoryId === null}
        onPress={() => onSelect(null)}
      />

      {categories.map(category => (
        <CategoryChip
          key={category.id}
          label={category.name}
          selected={selectedCategoryId === category.id}
          onPress={() => onSelect(category.id)}
        />
      ))}
    </ScrollView>
  );
}

interface CategoryItemProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function CategoryButton({label, selected, onPress}: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={styles.categoryButton}
      scaleOnFocus={false}
      accessibilityLabel={label}>
      {active => (
        <View style={styles.categoryInner}>
          {/* Selection and focus are different things and must look different:
              focus is where the D-pad is, selection is which filter is applied.
              A viewer needs to see both at once. */}
          <View
            style={[styles.selectionMarker, selected && styles.selectionMarkerActive]}
          />
          <Text
            style={[
              styles.categoryLabel,
              selected && styles.categoryLabelSelected,
              active && styles.categoryLabelActive,
            ]}
            numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

function CategoryChip({label, selected, onPress}: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      scaleOnFocus={false}
      accessibilityLabel={label}>
      {/* Unlike the sidebar, the chip carries selection in its own fill, so the
          label only has to distinguish selected from not. Press feedback is the
          ring Focusable draws. */}
      <Text
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
        numberOfLines={1}>
        {label}
      </Text>
    </Focusable>
  );
}

const useStyles = makeStyles(m => {
  // Read from the same helper the card-width calculation is handed, so the
  // padding the grid actually renders and the padding subtracted to size a card
  // cannot drift apart.
  const padding = gridPadding(m);

  return {
    splitRow: {
      flex: 1,
      flexDirection: 'row',
    },
    splitColumn: {
      flex: 1,
      flexDirection: 'column',
    },
    sidebar: {
      width: m.sidebarWidth,
      paddingLeft: m.gutter.horizontal,
      paddingRight: spacing.md,
      gap: spacing.xs,
    },
    sidebarHeading: {
      ...m.typography.caption,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      letterSpacing: 1,
    },
    categoryButton: {
      borderRadius: radius.sm,
      justifyContent: 'center',
      minHeight: m.minTouchTarget,
    },
    categoryInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    selectionMarker: {
      width: 3,
      height: 16,
      borderRadius: radius.pill,
      backgroundColor: 'transparent',
    },
    selectionMarkerActive: {
      backgroundColor: colors.accent,
    },
    categoryLabel: {
      ...m.typography.body,
      color: colors.textMuted,
      flexShrink: 1,
    },
    categoryLabelSelected: {
      color: colors.textPrimary,
    },
    categoryLabelActive: {
      color: colors.accent,
    },
    rail: {
      // A ScrollView inside a column flexbox would otherwise stretch to fill the
      // remaining height and take the grid's space with it.
      flexGrow: 0,
      marginBottom: spacing.sm,
    },
    railContent: {
      paddingHorizontal: m.gutter.horizontal,
      alignItems: 'center',
      gap: spacing.sm,
    },
    chip: {
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      minHeight: m.minTouchTarget,
    },
    chipSelected: {
      backgroundColor: colors.accentMuted,
    },
    chipLabel: {
      ...m.typography.body,
      color: colors.textSecondary,
    },
    chipLabelSelected: {
      color: colors.accent,
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
