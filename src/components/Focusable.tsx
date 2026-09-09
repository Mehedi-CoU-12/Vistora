import React, {useCallback, useRef, useState} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {colors, focusScale, radius} from '../theme';

interface FocusableProps {
  onPress?: () => void;
  /** Fires when the D-pad moves focus onto this item. */
  onFocus?: () => void;
  /**
   * Give exactly one element per screen initial focus. Without it, nothing is
   * focused on mount and the first D-pad press appears to do nothing.
   */
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Set false for large surfaces (rows, panels) where scaling looks wrong. */
  scaleOnFocus?: boolean;
  /** Set false to draw your own focus treatment instead of the default ring. */
  showFocusRing?: boolean;
  accessibilityLabel?: string;
  /** Render-prop form lets children react to focus without duplicating state. */
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
}

/**
 * The focus primitive every interactive element in the app is built from.
 *
 * Why this exists rather than using Pressable directly:
 *
 *  1. ONE focus vocabulary. Focus on a TV must be unmistakable, because the
 *     remote gives no other feedback -- there is no cursor and nothing under
 *     your finger. Centralising the treatment (ring + lift + lighter surface)
 *     means every card and button agrees, and changing it is a one-file edit.
 *
 *  2. Redundant cues. The focused state is signalled three ways at once: a
 *     coloured ring, a scale change, and a lighter background. Any one of them
 *     alone fails someone -- colour for a colour-blind viewer, scale on a small
 *     item, brightness on a washed-out panel.
 *
 *  3. Native focus, not JS focus. Pressable is focusable by default on TV, and
 *     the platform's own focus engine decides where the D-pad goes. We only
 *     react to it. That is why navigation feels correct at the edges of rows
 *     without us computing any geometry.
 */
export function Focusable({
  onPress,
  onFocus,
  hasTVPreferredFocus = false,
  disabled = false,
  style,
  scaleOnFocus = true,
  showFocusRing = true,
  accessibilityLabel,
  children,
}: FocusableProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: 120,
        // Runs on the UI thread, so focus stays responsive even while the JS
        // thread is busy parsing a Supabase response.
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (scaleOnFocus) {
      animateTo(focusScale);
    }
    onFocus?.();
  }, [animateTo, onFocus, scaleOnFocus]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (scaleOnFocus) {
      animateTo(1);
    }
  }, [animateTo, scaleOnFocus]);

  return (
    <Animated.View style={scaleOnFocus ? {transform: [{scale}]} : undefined}>
      <Pressable
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        hasTVPreferredFocus={hasTVPreferredFocus}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{disabled}}
        style={[
          styles.base,
          showFocusRing && focused && styles.focused,
          disabled && styles.disabled,
          style,
        ]}>
        {typeof children === 'function' ? children(focused) : children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    // A transparent border at rest, so gaining focus does not change layout.
    // Switching borderWidth 0 -> 2 on focus would shift every sibling card.
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: radius.md,
  },
  focused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceFocused,
  },
  disabled: {
    opacity: 0.45,
  },
});
