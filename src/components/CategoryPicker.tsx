import React from 'react';
import { ScrollView, Text, TVFocusGuideView, View } from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import type { Category } from '../types/content';
import { Focusable } from './Focusable';

export interface CategoryPickerProps {
  categories: Category[];
  /** Null means "All", which is always the first option. */
  selectedCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}

/**
 * The category filter beside (or above) a catalog grid.
 *
 * ---------------------------------------------------------------------------
 * It changes shape, and the test is on width rather than device
 * ---------------------------------------------------------------------------
 * On anything with room -- a TV, a tablet, a phone held sideways -- categories
 * are a SIDEBAR down the left. That is the right shape when it fits, because it
 * costs nothing vertically and shows every category at once.
 *
 * On a phone in portrait it does not fit. A 176dp sidebar out of 390dp is not a
 * sidebar, it is half the screen, and it would leave the grid too narrow for two
 * columns of 16:9 artwork. So below `SIDEBAR_MIN_CONTENT_WIDTH` (see
 * theme/metrics.ts) the same categories become a horizontal CHIP RAIL above the
 * grid: one row of vertical space in exchange for the full width.
 *
 * Note the test is on available width, not on device class. A phone in landscape
 * has 796dp of content width and passes it -- and *should*, because vertical
 * space is what that window is short of, so a picker that costs no height is
 * exactly what it wants.
 *
 * ---------------------------------------------------------------------------
 * Selection and focus, again
 * ---------------------------------------------------------------------------
 * Same rule as the tab bar, different drawing. A sidebar row carries selection
 * in a marker down its left edge, because a full-width fill behind a row of
 * text reads as focus and would fight the focus ring. A chip carries it in its
 * own fill, because a chip has an edge already.
 */
export function CategoryPicker(props: CategoryPickerProps) {
  const { usesSidebar } = useMetrics();

  return usesSidebar ? <Sidebar {...props} /> : <Rail {...props} />;
}

/** Categories down the left, for any window wide enough to spare the width. */
function Sidebar({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    // Pressing RIGHT out of the sidebar enters the grid at the card you last had
    // focused rather than back at the top-left, and the grid's own guide brings
    // you back here. Without the pair, focus at the boundary depends on raw
    // screen geometry and "left" from the middle of a grid may find nothing.
    <TVFocusGuideView autoFocus style={styles.sidebar}>
      <Text style={styles.sidebarHeading}>CATEGORIES</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sidebarContent}
      >
        <SidebarRow
          label="All"
          selected={selectedCategoryId === null}
          onPress={() => onSelect(null)}
        />

        {categories.map(category => (
          <SidebarRow
            key={category.id}
            label={category.name}
            selected={selectedCategoryId === category.id}
            onPress={() => onSelect(category.id)}
          />
        ))}
      </ScrollView>
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
function Rail({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const styles = useStyles();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railContent}
      style={styles.rail}
    >
      <Chip
        label="All"
        selected={selectedCategoryId === null}
        onPress={() => onSelect(null)}
      />

      {categories.map(category => (
        <Chip
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

function SidebarRow({ label, selected, onPress }: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={styles.sidebarRow}
      scaleOnFocus={false}
      // 'radio' rather than 'tab': these pick one filter out of a set within the
      // current screen, which is what TalkBack announces a radio as.
      accessibilityRole="radio"
      selected={selected}
      accessibilityLabel={label}
    >
      {active => (
        <View style={styles.sidebarRowInner}>
          <View
            style={[
              styles.selectionMarker,
              selected && styles.selectionMarkerActive,
            ]}
          />
          <Text
            style={[
              styles.sidebarLabel,
              selected && styles.sidebarLabelSelected,
              active && styles.sidebarLabelActive,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

function Chip({ label, selected, onPress }: CategoryItemProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      scaleOnFocus={false}
      accessibilityRole="radio"
      selected={selected}
      accessibilityLabel={label}
    >
      {/* Unlike a sidebar row, the chip carries selection in its own fill, so
          the label only has to distinguish selected from not. Press feedback is
          the ring Focusable draws. */}
      <Text
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  sidebar: {
    width: m.sidebarWidth,
    paddingLeft: m.gutter.horizontal,
    paddingRight: spacing.md,
  },
  sidebarHeading: {
    ...m.typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  sidebarContent: {
    gap: spacing.xs,
    // An imported channel list can carry thirty categories, which is taller
    // than a 540dp television. The rail below already scrolled; this one has to
    // as well, or the last categories are unreachable.
    paddingBottom: m.gutter.vertical,
  },
  sidebarRow: {
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: m.minTouchTarget,
  },
  sidebarRowInner: {
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
  sidebarLabel: {
    ...m.typography.body,
    color: colors.textMuted,
    flexShrink: 1,
  },
  sidebarLabelSelected: {
    color: colors.textPrimary,
  },
  sidebarLabelActive: {
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
}));
