import React from 'react';
import { ActivityIndicator, Text, TVFocusGuideView, View } from 'react-native';

import type { AppError } from '../services/errors';
import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { Focusable } from './Focusable';

interface GridFooterProps {
  isLoadingMore: boolean;

  hasMore: boolean;

  /** Failure of the page below what is on screen; the grid stays usable. */
  moreError: AppError | null;

  onLoadMore: () => void;

  /** Hidden for a list short enough that there is nothing below it. */
  itemCount: number;

  /** Plural noun for the end-of-list line, e.g. "films". */
  noun: string;

  /**
   * A genre filter is narrowing the grid, so the counts describe the filtered
   * view rather than everything loaded.
   */
  filtered?: boolean;
}

/**
 * Sits under the grid and carries the whole paging affordance: a spinner while
 * a page is in flight, a focusable button to pull the next one, a retry when a
 * page failed, and an end marker once the source is spent.
 *
 * The button matters on TV, where there is no scroll gesture to trigger
 * `onEndReached` — the D-pad needs something to land on.
 */
export function GridFooter({
  isLoadingMore,
  hasMore,
  moreError,
  onLoadMore,
  itemCount,
  noun,
  filtered = false,
}: GridFooterProps) {
  const { isTV } = useMetrics();
  const styles = useStyles();

  if (itemCount === 0) {
    return null;
  }

  if (isLoadingMore) {
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.note}>Loading more…</Text>
      </View>
    );
  }

  if (moreError !== null) {
    return (
      <View style={styles.footer}>
        <Text style={styles.note} numberOfLines={2}>
          {moreError.userMessage}
        </Text>

        <Button label="Try again" onPress={onLoadMore} />
      </View>
    );
  }

  if (!hasMore) {
    return (
      <View style={styles.footer}>
        <View style={styles.rule} />
        <Text style={styles.note}>
          {filtered
            ? `${itemCount} ${noun} in this category`
            : `That is all ${itemCount} ${noun}`}
        </Text>
      </View>
    );
  }

  return (
    <TVFocusGuideView style={styles.footer} autoFocus={false}>
      <Button label="Load more" onPress={onLoadMore} />

      {}
      {filtered ? (
        <Text style={styles.hint}>
          {itemCount} {noun} so far in this category
        </Text>
      ) : isTV ? null : (
        <Text style={styles.hint}>or keep scrolling</Text>
      )}
    </TVFocusGuideView>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.button}
      scaleOnFocus={false}
    >
      {active => (
        <Text style={[styles.buttonLabel, active && styles.buttonLabelActive]}>
          {label}
        </Text>
      )}
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,

    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,

    minHeight: m.minTouchTarget,
    minWidth: 180,

    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    ...m.typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  buttonLabelActive: {
    color: colors.accent,
  },
  note: {
    ...m.typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  hint: {
    ...m.typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  rule: {
    height: 1,
    width: 120,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
}));
