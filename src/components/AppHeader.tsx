import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, spacing } from '../theme';

/**
 * A screen's own heading: what you are looking at, and how much of it.
 *
 * ---------------------------------------------------------------------------
 * One row, not three
 * ---------------------------------------------------------------------------
 * This used to stack the wordmark, a title and a subtitle vertically. Three
 * lines of chrome is affordable on a 960 x 540 television and expensive on a
 * phone -- and it was also redundant, because the wordmark now lives in the top
 * bar next to the tab rail and the tab rail already names the section.
 *
 * So: title and subtitle share a baseline, separated by a middot. On a
 * television that is one line instead of three, which is a whole extra row of
 * cards; on a phone it is the difference between chrome that takes an eighth of
 * the screen and chrome that takes a twentieth.
 *
 * The title is the part that must survive a narrow window, so it refuses to
 * shrink and the subtitle -- a count, always regenerable from the content
 * itself -- ellipsises instead.
 */
export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const styles = useStyles();

  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>

        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text style={styles.separator}>· </Text>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(m => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  titles: {
    flexDirection: 'row',
    // Baseline rather than centre: the title and the subtitle are different
    // sizes, and centring two different cap heights leaves the smaller one
    // floating.
    alignItems: 'baseline',
    flexShrink: 1,
  },
  title: {
    ...m.typography.title,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  subtitle: {
    ...m.typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  separator: {
    color: colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.md,
  },
}));
