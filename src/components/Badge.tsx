import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';

/**
 * Small overlay tag on a card: LIVE, a channel number, 4K.
 * `tone="live"` is reserved for content that is genuinely on air now.
 */
export function Badge({label, tone = 'neutral'}: {label: string; tone?: 'neutral' | 'live'}) {
  return (
    <View style={[styles.badge, tone === 'live' && styles.live]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    ...typography.label,
    color: colors.textPrimary,
  },
});
