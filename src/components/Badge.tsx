import React from 'react';
import {Text, View} from 'react-native';

import {colors, makeStyles, radius, spacing} from '../theme';

/**
 * Small overlay tag on a card: LIVE, a channel number, 4K.
 * `tone="live"` is reserved for content that is genuinely on air now.
 */
export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'live';
}) {
  const styles = useStyles();

  return (
    <View style={[styles.badge, tone === 'live' && styles.live]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const useStyles = makeStyles(m => ({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.scrim,
  },
  live: {
    backgroundColor: colors.live,
  },
  label: {
    ...m.typography.label,
    color: colors.textPrimary,
  },
}));
