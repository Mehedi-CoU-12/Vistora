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
  /** True for the first row on a screen, to seed initial focus. */
  isFirstRow?: boolean;
  /**
   * Jump to the tab that holds all of this row's content. Rendered as a "See
   * all" beside the heading, and TOUCH ONLY -- see the note below.
   */
  onSeeAll?: () => void;
}

/**
 * A titled horizontal row ("shelf") of cards.
 *
 * ---------------------------------------------------------------------------
 * Two TV-specific details do all the work here
 * ---------------------------------------------------------------------------
 *
 * 1. `TVFocusGuideView autoFocus`
 *    This gives the row FOCUS MEMORY. Scroll right to the eighth channel, press
 *    down to the next row, then press up again -- without this you land back on
 *    the first card, which feels broken. With it, focus returns to the eighth.
 *    It is the single biggest difference between a TV UI that feels native and
 *    one that feels like a ported phone app. On a phone it renders as a plain
 *    View, since there is no focus to remember.
 *
 * 2. A horizontal FlatList is safe here, which is not true of plain React
 *    Native. Virtualization normally breaks D-pad navigation: the platform
 *    focus engine can only move to views that EXIST, so focus stops dead at the
 *    last rendered cell and the row appears to end early. The tvOS fork's
 *    VirtualizedList handles this by wrapping the scroller in a focus guide with
 *    trapFocusLeft/Right enabled while unrendered cells remain, so focus is held
 *    inside the row until the list has scrolled and rendered more.
 *
 * The row itself needs no responsive code. Card widths come from the theme, and
 * the theme sizes them so a fraction of a card is always visible at the right
 * edge -- which is what tells a phone user the row scrolls at all, there being
 * no D-pad to nudge and find out with.
 */
export function ContentRow({
  title,
  items,
  cardVariant,
  onSelectItem,
  isFirstRow = false,
  onSeeAll,
}: ContentRowProps) {
  const { isTV, isTouch } = useMetrics();
  const styles = useStyles();

  /**
   * "See all" is a touch affordance and deliberately absent on TV.
   *
   * On a phone it is the only way to get from a shelf to the whole catalog
   * without hunting for the tab bar at the bottom of the screen. On a TV it
   * would be a focus stop between every card and the tab rail -- press UP from
   * a card and you would land on a button rather than on the navigation --
   * which is exactly the "ported phone app" feel the rest of this file exists
   * to avoid. The rail is already one press away up there.
   */
  const seeAll = isTouch ? onSeeAll : undefined;

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => (
      <ContentCard
        item={item}
        variant={cardVariant}
        onPress={onSelectItem}
        // Exactly one element per screen should claim initial focus, so this is
        // the very first card of the very first row.
        hasTVPreferredFocus={isFirstRow && index === 0}
      />
    ),
    [cardVariant, isFirstRow, onSelectItem],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    // `scrollSnapAlign="start"` makes THIS view -- heading included -- the unit
    // the vertical scroller aligns to when focus lands on any card inside it.
    //
    // Without it, Android's default behaviour is requestChildRectangleOnScreen,
    // which scrolls the minimum distance needed to reveal the focused *card*.
    // The heading sits above the card, so it stays clipped off the top edge and
    // the user cannot see which row they are in. The fork walks up from the
    // focused view to the nearest ancestor carrying this prop, which is why
    // marking the section rather than the card is what fixes it.
    <View style={styles.section} scrollSnapAlign="start">
      <View style={styles.headingRow}>
        <Text style={styles.heading} numberOfLines={1}>
          {title}
        </Text>

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
          // Render a full screen's worth up front so the first D-pad press right
          // never waits on a render. A phone shows two or three cards rather
          // than six, so it needs fewer -- but still more than are visible, or
          // the first flick reveals blank space.
          initialNumToRender={isTV ? 8 : 6}
          windowSize={5}
          // Recycling views out from under the focus engine causes focus to jump
          // to the top of the screen. Cards are cheap; keep them mounted.
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
    // Only ever rendered on touch, so the minimum is unconditional here -- but
    // it comes from the metrics anyway, so a tablet gets the same number a
    // phone does rather than a second constant.
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
    // Left padding aligns cards with the heading, less the card's own padding.
    // The generous vertical padding is not decorative: an active card scales and
    // draws a ring, and without room to grow it gets clipped by the row's own
    // bounds.
    paddingHorizontal: m.gutter.horizontal - spacing.xs,
    paddingVertical: spacing.sm,
  },
}));
