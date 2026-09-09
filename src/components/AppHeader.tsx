import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {colors, overscan, spacing, typography} from '../theme';

/**
 * Screen header: wordmark plus an optional title and action area.
 * Kept a plain layout component -- it owns no focus and no state.
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
  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        <Text style={styles.brand}>
          VISTORA<Text style={styles.brandAccent}>.</Text>
        </Text>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: overscan.horizontal,
    paddingTop: overscan.vertical,
    paddingBottom: spacing.md,
  },
  titles: {
    gap: 2,
  },
  brand: {
    ...typography.display,
    color: colors.textPrimary,
  },
  brandAccent: {
    color: colors.accent,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.textSecondary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
