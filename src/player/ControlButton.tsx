import React, { useCallback, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { resolvePlayerChrome } from './playerLayout';

/**
 * A control in the player overlay, on either kind of device.
 *
 * `src/components/Focusable.tsx` is the app's general focus primitive and is not
 * used here, on purpose. It is built for cards: it scales on focus, draws a ring,
 * and knows nothing about being pressed, because on a TV nothing is. A player
 * control has two extra requirements that do not belong in a card component:
 *
 *   - It must acknowledge a *touch*. A finger gets no focus ring, so without a
 *     pressed state a tap on the pause button gives no feedback at all until the
 *     video reacts -- which, over a stalled network, can be a second later.
 *   - It must not scale on focus. These sit in a row over moving video, and a
 *     button that grows on focus shifts its neighbours; on a card grid that
 *     reads as life, on a control bar it reads as a wobble.
 *
 * What it does keep is the app's focus vocabulary: accent ring, lighter surface,
 * accent text -- three cues at once, so focus survives a colour-blind viewer, a
 * washed-out panel, or a small control.
 */

export type ControlVariant = 'pill' | 'round' | 'primary';

interface ControlButtonProps {
  /** A character from `glyph`, drawn before the label. */
  glyph?: string;
  /** Word label. Omitted on narrow screens by the caller, not by this component. */
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: ControlVariant;
  /**
   * Marks a setting as the one in effect (the current speed, the current audio
   * track). Different from focus, and it has to look different: focus is where
   * the D-pad is, selection is what the player is doing.
   */
  selected?: boolean;
  disabled?: boolean;
  /** Exactly one control per overlay state should claim initial D-pad focus. */
  hasTVPreferredFocus?: boolean;
  onFocusChange?: (focused: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

export function ControlButton({
  glyph: glyphChar,
  label,
  accessibilityLabel,
  onPress,
  variant = 'pill',
  selected = false,
  disabled = false,
  hasTVPreferredFocus = false,
  onFocusChange,
  style,
}: ControlButtonProps) {
  const styles = useStyles();
  const { isTouch } = useMetrics();
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
  }, [onFocusChange]);

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      // A finger aiming at a 48dp button in the dark misses by a few dp; the
      // slop makes that a hit without making the button visually larger.
      hitSlop={isTouch ? spacing.sm : undefined}
      style={({ pressed }) => [
        styles.base,
        variant === 'pill' && styles.pill,
        variant === 'round' && styles.round,
        variant === 'primary' && styles.primary,
        selected && styles.selected,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {glyphChar ? (
          <Text
            style={[
              variant === 'primary' ? styles.glyphPrimary : styles.glyph,
              variant === 'round' && styles.glyphRound,
              (focused || selected) && styles.textActive,
            ]}
          >
            {glyphChar}
          </Text>
        ) : null}

        {label ? (
          <Text
            style={[styles.label, (focused || selected) && styles.textActive]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      // A transparent border at rest, so gaining focus does not change the
      // layout. Switching borderWidth 0 -> 2 on focus would nudge every
      // neighbouring button along the row.
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: colors.surface,
    },
    pill: {
      minHeight: chrome.buttonHeight,
      paddingHorizontal: chrome.buttonPaddingH,
      borderRadius: radius.pill,
    },
    round: {
      width: chrome.skipButton,
      height: chrome.skipButton,
      borderRadius: radius.pill,
      backgroundColor: colors.scrim,
    },
    primary: {
      width: chrome.centreButton,
      height: chrome.centreButton,
      borderRadius: radius.pill,
      backgroundColor: colors.scrim,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    glyph: {
      fontSize: chrome.glyphSize,
      lineHeight: chrome.glyphSize + 4,
      color: colors.textPrimary,
    },
    glyphRound: {
      fontSize: chrome.skipGlyph,
      lineHeight: chrome.skipGlyph + 4,
    },
    glyphPrimary: {
      fontSize: chrome.centreGlyph,
      lineHeight: chrome.centreGlyph + 4,
      color: colors.textPrimary,
      // The play triangle is drawn with a slight left bias inside its em box, so
      // centring the character leaves it visibly off-centre in a round button.
      marginLeft: 2,
    },
    label: {
      ...metrics.typography.body,
      color: colors.textPrimary,
    },
    textActive: {
      color: colors.accent,
    },
    selected: {
      backgroundColor: colors.accentMuted,
    },
    focused: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceFocused,
    },
    pressed: {
      // Touch feedback: the surface lifts and the whole control shrinks a touch,
      // the same press language the cards use.
      backgroundColor: colors.surfaceFocused,
      transform: [{ scale: metrics.pressScale }],
    },
    disabled: {
      opacity: 0.45,
    },
  };
});
