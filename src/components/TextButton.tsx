import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {Focusable} from './Focusable';

/** A pill button. Focus styling comes from Focusable, so it matches every card. */
export function TextButton({
  label,
  onPress,
  hasTVPreferredFocus = false,
}: {
  label: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.button}
      accessibilityLabel={label}>
      {focused => (
        <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  labelFocused: {
    color: colors.accent,
  },
});
