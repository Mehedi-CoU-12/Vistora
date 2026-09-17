import React, { useCallback } from 'react';
import { FlatList, Text, TVFocusGuideView, View } from 'react-native';

import {
  colors,
  makeStyles,
  radius,
  spacing,
  useMetrics,
  type CardVariant,
} from '../theme';
import type { ContentItem } from '../types/content';
import { ContentCard } from './ContentCard';
import { Focusable } from './Focusable';

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  cardVariant: CardVariant;
  onSelectItem: (item: ContentItem) => void;

  isFirstRow?: boolean;

  onSeeAll?: () => void;

  progress?: ReadonlyMap<string, number>;

  showCardTitles?: boolean;
}

export function ContentRow({
  title,
  items,
  cardVariant,
  onSelectItem,
  isFirstRow = false,
  onSeeAll,
  progress,
  showCardTitles = true,
}: ContentRowProps) {
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  const seeAll = isTouch ? onSeeAll : undefined;

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => (
      <ContentCard
        item={item}
        variant={cardVariant}
        onPress={onSelectItem}
        progress={progress?.get(item.id)}
        showTitle={showCardTitles}
        hasTVPreferredFocus={isFirstRow && index === 0}
      />
    ),
    [cardVariant, isFirstRow, onSelectItem, progress, showCardTitles],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} scrollSnapAlign="start">
      <View style={styles.headingRow}>
        {}
        <View style={styles.headingGroup}>
          {}
          <View style={styles.headingMark} />

          <Text style={styles.heading} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {seeAll ? (
          <Focusable
            onPress={seeAll}
            scaleOnFocus={false}
            style={styles.seeAll}
            accessibilityLabel={`See all ${title}`}
          >
            {active => (
              <Text
                style={[styles.seeAllLabel, active && styles.seeAllLabelActive]}
              >
                See all
              </Text>
            )}
          </Focusable>
        ) : null}
      </View>

      <TVFocusGuideView autoFocus>
        <FlatList
          horizontal
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={isTV ? 8 : 6}
          windowSize={5}
          removeClippedSubviews={false}
        />
      </TVFocusGuideView>
    </View>
  );
}

const keyExtractor = (item: ContentItem) => item.id;

const useStyles = makeStyles(m => ({
  section: {
    marginBottom: spacing.lg,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: m.gutter.horizontal,
  },
  headingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,

    flexShrink: 1,
  },
  headingMark: {
    width: 3,

    height: Math.round(m.typography.sectionTitle.fontSize * 0.8),
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  heading: {
    ...m.typography.sectionTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  seeAll: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    flexShrink: 0,

    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  seeAllLabel: {
    ...m.typography.caption,
    color: colors.accent,
  },
  seeAllLabelActive: {
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: m.gutter.horizontal - spacing.xs,
    paddingVertical: spacing.sm,
  },
}));
