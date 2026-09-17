import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, makeStyles, radius, useMetrics } from '../theme';

interface FocusableProps {
  onPress?: () => void;

  onFocus?: () => void;

  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;

  scaleOnFocus?: boolean;

  showFocusRing?: boolean;
  accessibilityLabel?: string;

  accessibilityRole?: AccessibilityRole;

  selected?: boolean;

  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}

export function Focusable({
  onPress,
  onFocus,
  hasTVPreferredFocus = false,
  disabled = false,
  style,
  scaleOnFocus = true,
  showFocusRing = true,
  accessibilityLabel,
  accessibilityRole = 'button',
  selected,
  children,
}: FocusableProps) {
  const { focusScale, isTV, pressScale } = useMetrics();
  const styles = useStyles();

  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const active = isTV ? focused : pressed;

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: 120,

        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const animateIf = useCallback(
    (condition: boolean, value: number) => {
      if (condition && scaleOnFocus) {
        animateTo(value);
      }
    },
    [animateTo, scaleOnFocus],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    animateIf(isTV, focusScale);
    onFocus?.();
  }, [animateIf, focusScale, isTV, onFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    animateIf(isTV, 1);
  }, [animateIf, isTV]);

  const handlePressIn = useCallback(() => {
    setPressed(true);
    animateIf(!isTV, pressScale);
  }, [animateIf, isTV, pressScale]);

  const handlePressOut = useCallback(() => {
    setPressed(false);
    animateIf(!isTV, 1);
  }, [animateIf, isTV]);

  return (
    <Animated.View
      style={scaleOnFocus ? { transform: [{ scale }] } : undefined}
    >
      <Pressable
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        hasTVPreferredFocus={isTV && hasTVPreferredFocus}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected }}
        style={[
          styles.base,
          showFocusRing && active && styles.active,
          disabled && styles.disabled,
          style,
        ]}
      >
        {typeof children === 'function' ? children(active) : children}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  active: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceFocused,
  },
  disabled: {
    opacity: 0.45,
  },
}));
