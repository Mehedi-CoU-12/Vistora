import React, {useCallback} from 'react';
import {FlatList, StyleSheet, Text, TVFocusGuideView, View} from 'react-native';

import {colors, overscan, spacing, typography, type CardVariant} from '../theme';
import type {ContentItem} from '../types/content';
import {ContentCard} from './ContentCard';

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  cardVariant: CardVariant;
  onSelectItem: (item: ContentItem) => void;
  /** True for the first row on a screen, to seed initial focus. */
  isFirstRow?: boolean;
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
 *    one that feels like a ported phone app.
 *
 * 2. A horizontal FlatList is safe here, which is not true of plain React
 *    Native. Virtualization normally breaks D-pad navigation: the platform
 *    focus engine can only move to views that EXIST, so focus stops dead at the
 *    last rendered cell and the row appears to end early. The tvOS fork's
 *    VirtualizedList handles this by wrapping the scroller in a focus guide with
 *    trapFocusLeft/Right enabled while unrendered cells remain, so focus is held
 *    inside the row until the list has scrolled and rendered more.
 */
export function ContentRow({
  title,
  items,
  cardVariant,
  onSelectItem,
  isFirstRow = false,
}: ContentRowProps) {
  const renderItem = useCallback(
    ({item, index}: {item: ContentItem; index: number}) => (
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
      <Text style={styles.heading}>{title}</Text>

      <TVFocusGuideView autoFocus>
        <FlatList
          horizontal
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // Render a full screen's worth up front so the first D-pad press right
          // never waits on a render.
          initialNumToRender={8}
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

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  heading: {
    ...typography.sectionTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    paddingHorizontal: overscan.horizontal,
  },
  listContent: {
    // Left padding aligns cards with the heading. The generous vertical padding
    // is not decorative: a focused card scales up and draws a ring, and without
    // room to grow it gets clipped by the row's own bounds.
    paddingHorizontal: overscan.horizontal - spacing.xs,
    paddingVertical: spacing.sm,
  },
});
