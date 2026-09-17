import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { Focusable } from './Focusable';
import { Gradient } from './Gradient';

export type ButtonVariant = 'pill' | 'primary' | 'secondary';

const PRIMARY_SWEEP = [colors.brandViolet, colors.brandCyan] as const;

const tint = {
  rest: colors.textSecondary,
  selected: colors.accent,
  active: colors.textPrimary,
} as const;

function contentTint(
  variant: ButtonVariant,
  selected: boolean,
  active: boolean,
): string {
  if (variant === 'primary') {
    return colors.textOnAccent;
  }
  if (variant === 'secondary') {
    return active ? colors.textPrimary : colors.textOnArt;
  }
  return active ? tint.active : selected ? tint.selected : tint.rest;
}

type TextButtonProps = {
  onPress: () => void;
  hasTVPreferredFocus?: boolean;

  selected?: boolean;

  variant?: ButtonVariant;

  stretch?: boolean;

  children?: (color: string) => React.ReactNode;
} & (
  | { label: string; accessibilityLabel?: string }
  | { label?: undefined; accessibilityLabel: string }
);

export function TextButton({
  label,
  accessibilityLabel,
  onPress,
  hasTVPreferredFocus = false,
  selected = false,
  variant = 'pill',
  stretch = false,
  children,
}: TextButtonProps) {
  const styles = useStyles();

  return (
    <Focusable
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      selected={selected}
      style={[
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,

        children && label === undefined && styles.buttonIconOnly,
        selected && variant === 'pill' && styles.buttonSelected,
        stretch && styles.buttonStretch,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {active => (
        <>
          {}
          {variant === 'primary' ? (
            <Gradient
              colors={PRIMARY_SWEEP}
              direction="right"
              easing="linear"
              style={styles.primaryFill}
            />
          ) : null}

          <View style={styles.content}>
            {children ? children(contentTint(variant, selected, active)) : null}

            {label !== undefined ? (
              <Text
                style={[
                  styles.label,
                  variant === 'primary' && styles.labelPrimary,
                  variant === 'secondary' && styles.labelSecondary,
                  selected && variant === 'pill' && styles.labelSelected,
                  active && variant === 'pill' && styles.labelActive,
                  active && variant === 'secondary' && styles.labelActive,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ) : null}
          </View>
        </>
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

    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  buttonIconOnly: {
    paddingHorizontal: spacing.md,

    minWidth: m.minTouchTarget || 40,
    alignItems: 'center',
  },
  buttonSelected: {
    backgroundColor: colors.accentMuted,
  },

  buttonPrimary: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
  },

  buttonSecondary: {
    backgroundColor: colors.surfaceOverArt,
    borderWidth: 1,
    borderColor: colors.borderOverArt,
    paddingHorizontal: spacing.lg,
  },
  buttonStretch: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: 'center',
  },
  primaryFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    ...m.typography.body,
    color: tint.rest,
  },
  labelPrimary: {
    color: colors.textOnAccent,
    fontWeight: '700',
  },
  labelSecondary: {
    color: colors.textOnArt,
    fontWeight: '600',
  },
  labelSelected: {
    color: tint.selected,
  },
  labelActive: {
    color: tint.active,
  },
}));
