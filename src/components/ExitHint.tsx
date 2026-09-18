import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

import { colors, duration, makeStyles, radius, spacing } from '../theme';

export function ExitHint({
  visible,
  label = 'Press back again to exit',
}: {
  visible: boolean;
  label?: string;
}) {
  const styles = useStyles();

  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: duration.quick,
      useNativeDriver: true,
    }).start();
  }, [opacity, visible]);

  return (
    <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(m => ({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: m.gutter.vertical,
    alignItems: 'center',
    paddingHorizontal: m.gutter.horizontal,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...m.typography.body,
    color: colors.textPrimary,
  },
}));
