import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useResolutionState } from '../state/playbackResolution';
import { colors, makeStyles, spacing } from '../theme';

export function ResolvingOverlay() {
  const { isResolving, title } = useResolutionState();
  const styles = useStyles();

  if (!isResolving) {
    return null;
  }

  return (
    <View style={styles.root} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.accent} />

      {}
      <Text style={styles.label} numberOfLines={2}>
        {title ? `Starting ${title}…` : 'Finding a stream…'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(m => ({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: m.gutter.horizontal,

    backgroundColor: colors.scrim,
  },
  label: {
    ...m.typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
  },
}));
