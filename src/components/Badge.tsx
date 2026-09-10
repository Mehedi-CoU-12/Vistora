import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';

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
