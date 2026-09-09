import React from 'react';
import {Text, View} from 'react-native';

import {colors, makeStyles, spacing} from '../theme';

/**
 * Screen header: wordmark plus an optional title and action area.
 * Kept a plain layout component -- it owns no focus and no state.
 *
 * The one responsive detail worth naming: the titles block shrinks and the
 * action area does not. On a 390dp phone the wordmark, a screen title and an
 * "All channels" button are competing for a row that fits maybe two of them, and
 * the button is the one that must stay whole -- a clipped label is unreadable,
 * whereas a truncated subtitle still reads.
 */
export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const styles = useStyles();

  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={styles.brand} numberOfLines={1}>
          VISTORA<Text style={styles.brandAccent}>.</Text>
        </Text>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,
    paddingTop: m.gutter.vertical,
    paddingBottom: spacing.md,
  },
  titles: {
    gap: 2,
    flexShrink: 1,
  },
  brand: {
    ...m.typography.display,
    color: colors.textPrimary,
  },
  brandAccent: {
    color: colors.accent,
  },
  title: {
    ...m.typography.sectionTitle,
    color: colors.textSecondary,
  },
  subtitle: {
    ...m.typography.caption,
    color: colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: spacing.md,
  },
}));
