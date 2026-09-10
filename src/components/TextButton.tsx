import React from 'react';
import { Text } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { Focusable } from './Focusable';

/**
 * A pill button. Interaction styling comes from Focusable, so it matches every
 * card on both a remote and a finger.
 */
export function TextButton({
  label,
  onPress,
  hasTVPreferredFocus = false,
}: {
  label: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.button}
      accessibilityLabel={label}
    >
      {active => (
        <Text style={[styles.label, active && styles.labelActive]}>
          {label}
        </Text>
      )}
    </Focusable>
  );
}

const useStyles = makeStyles(m => ({
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    // A remote can land on a 28dp-tall pill precisely; a fingertip cannot.
    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  label: {
    ...m.typography.body,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.accent,
  },
}));
