import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useMemo, useState} from 'react';
import {FlatList, StyleSheet, Text, TVFocusGuideView, View} from 'react-native';

import {AppHeader} from '../components/AppHeader';
import {ContentCard} from '../components/ContentCard';
import {ScreenContainer} from '../components/ScreenContainer';
import {EmptyState, ErrorState, LoadingState} from '../components/StateViews';
import {Focusable} from '../components/Focusable';
import {useAsyncData} from '../hooks/useAsyncData';
import {fetchCategories, fetchChannels} from '../services/contentService';
import {cardSize, colors, overscan, radius, spacing, typography} from '../theme';
import type {Category, ContentItem} from '../types/content';

/** Cards per row in the grid. Chosen to fit the ~960dp viewport comfortably. */
const COLUMNS = 5;

interface LiveTvData {
  channels: ContentItem[];
  categories: Category[];
}

/**
 * The full Live TV browser: a category sidebar on the left, a channel grid on
 * the right.
 *
 * ---------------------------------------------------------------------------
 * The interesting part is the two focus guides
 * ---------------------------------------------------------------------------
 * The screen is a left/right split, and moving between the halves with the
 * D-pad is exactly where TV layouts usually go wrong. Two `TVFocusGuideView`s
 * with `autoFocus` fix it:
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

  const renderChannel = useCallback(
    ({item, index}: {item: ContentItem; index: number}) => (
      <ContentCard
        item={item}
        variant="landscape"
        onPress={openChannel}
        hasTVPreferredFocus={gridMayClaimFocus && index === 0}
      />
    ),
    [gridMayClaimFocus, openChannel],
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
        subtitle={`${visibleChannels.length} channel${visibleChannels.length === 1 ? '' : 's'}`}
      />

      <View style={styles.split}>
        <TVFocusGuideView autoFocus style={styles.sidebar}>
          <Text style={styles.sidebarHeading}>Categories</Text>

          <CategoryButton
            label="All"
            selected={selectedCategoryId === null}
            onPress={() => selectCategory(null)}
          />

          {data.categories.map(category => (
            <CategoryButton
              key={category.id}
              label={category.name}
              selected={selectedCategoryId === category.id}
              onPress={() => selectCategory(category.id)}
            />
          ))}
        </TVFocusGuideView>

        <TVFocusGuideView autoFocus style={styles.gridArea}>
          {visibleChannels.length === 0 ? (
            <EmptyState
              title="Nothing in this category"
              message="Pick another category from the left."
            />
          ) : (
            <FlatList
              // Remounting on category change resets scroll position to the top,
              // which is what you want: keeping the old offset would leave the
              // user staring at blank space in a shorter list.
              key={selectedCategoryId ?? 'all'}
              data={visibleChannels}
              renderItem={renderChannel}
              keyExtractor={item => item.id}
              numColumns={COLUMNS}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={styles.gridRow}
              showsVerticalScrollIndicator={false}
              initialNumToRender={COLUMNS * 3}
              removeClippedSubviews={false}
            />
          )}
        </TVFocusGuideView>
      </View>
    </ScreenContainer>
  );
}

function CategoryButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Focusable
      onPress={onPress}
      style={styles.categoryButton}
      scaleOnFocus={false}
      accessibilityLabel={label}>
      {focused => (
        <View style={styles.categoryInner}>
          {/* Selection and focus are different things and must look different:
              focus is where the D-pad is, selection is which filter is applied.
              A viewer needs to see both at once. */}
          <View
            style={[
              styles.selectionMarker,
              selected && styles.selectionMarkerActive,
            ]}
          />
          <Text
            style={[
              styles.categoryLabel,
              selected && styles.categoryLabelSelected,
              focused && styles.categoryLabelFocused,
            ]}
            numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 176,
    paddingLeft: overscan.horizontal,
    paddingRight: spacing.md,
    gap: spacing.xs,
  },
  sidebarHeading: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  categoryButton: {
    borderRadius: radius.sm,
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
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  categoryLabelSelected: {
    color: colors.textPrimary,
  },
  categoryLabelFocused: {
    color: colors.accent,
  },
  gridArea: {
    flex: 1,
  },
  gridContent: {
    paddingLeft: spacing.sm,
    paddingRight: overscan.horizontal,
    paddingBottom: overscan.vertical + spacing.lg,
  },
  gridRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
    // Grid rows are left-aligned so a partially filled last row does not
    // centre its cards under the full rows above.
    justifyContent: 'flex-start',
    // Leaves room for the focus ring and the scale-up.
    minHeight: cardSize.landscape.height + spacing.xl,
  },
});
