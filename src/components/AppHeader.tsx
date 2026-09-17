import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, spacing } from '../theme';





















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
