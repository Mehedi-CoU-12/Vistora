import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, makeStyles, radius, useMetrics } from '../theme';

interface FocusableProps {
  onPress?: () => void;
  /** Fires when the D-pad moves focus onto this item. TV only. */
  onFocus?: () => void;
  /**
   * Give exactly one element per screen initial focus. Without it, nothing is
   * focused on mount and the first D-pad press appears to do nothing. Ignored on
   * a touch device, which has no focus to seed.
   */
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Set false for large surfaces (rows, panels) where scaling looks wrong. */
  scaleOnFocus?: boolean;
  /** Set false to draw your own focus treatment instead of the default ring. */
  showFocusRing?: boolean;
  accessibilityLabel?: string;
  /**
   * Render-prop form lets children react to the active state without
   * duplicating it. "Active" is focus on TV and a finger held down on touch --
   * see the note below on why those are the same argument.
   */
  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}

/**
 * The interaction primitive every interactive element in the app is built from.
 *
 * Why this exists rather than using Pressable directly:
 *
 *  1. ONE interaction vocabulary. Centralising the treatment (ring + scale +
 *     lighter surface) means every card and button agrees, and changing it is a
 *     one-file edit.
 *
 *  2. Redundant cues. The active state is signalled three ways at once: a
 *     coloured ring, a scale change, and a lighter background. Any one of them
 *     alone fails someone -- colour for a colour-blind viewer, scale on a small
 *     item, brightness on a washed-out panel.
 *
 *  3. Native focus, not JS focus. Pressable is focusable by default on TV, and
 *     the platform's own focus engine decides where the D-pad goes. We only
 *     react to it. That is why navigation feels correct at the edges of rows
 *     without us computing any geometry.
 *
 * ---------------------------------------------------------------------------
 * Focus and press are the same state, rendered from different inputs
 * ---------------------------------------------------------------------------
 * On a TV, focus is the whole interface: the remote gives no other feedback --
 * no cursor, nothing under your finger -- so the focused element has to be
 * unmistakable, and it persists while the user decides.
 *
 * On a phone none of that applies. There is no focus, nothing is highlighted
 * while you think, and the only feedback that matters is confirmation that the
 * tap landed on the thing you meant. So the same three cues are driven by
 * `pressed` instead of `focused`, and the scale goes the other way: a TV card
 * grows to say "you are here", a phone card shrinks to say "I felt that".
 *
 * Collapsing both into one `active` flag is what keeps every consumer of this
 * component free of `Platform` checks.
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
  const { focusScale, isTV, pressScale } = useMetrics();
  const styles = useStyles();

  // Tracked separately rather than as one `active` flag, because a D-pad
  // produces BOTH: pressing OK on a focused card fires onPressIn/onPressOut as
  // well as holding focus. Collapsing them would let the press-out clear the
  // ring off a card the user is still sitting on.
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const active = isTV ? focused : pressed;

  const animateTo = useCallback(
    (value: number) => {
      Animated.timing(scale, {
        toValue: value,
        duration: 120,
        // Runs on the UI thread, so interaction stays responsive even while the
        // JS thread is busy parsing a Supabase response.
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
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
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
    // A transparent border at rest, so becoming active does not change layout.
    // Switching borderWidth 0 -> 2 would shift every sibling card.
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
