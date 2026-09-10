import React, { useCallback, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, makeStyles, radius, spacing, useMetrics } from '../theme';
import { PlayerIcon, type IconName } from './PlayerIcon';
import { resolvePlayerChrome, type PlayerChrome } from './playerLayout';

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
 * accent icon -- three cues at once, so focus survives a colour-blind viewer, a
 * washed-out panel, or a small control.
 *
 * ---------------------------------------------------------------------------
 * Why the surface is translucent here and solid everywhere else in the app
 * ---------------------------------------------------------------------------
 * A card sits on the app's background and can be a solid tile. These sit on top
 * of a film, and a solid tile over a film is a hole punched in the picture --
 * eight of them along the bottom edge and the overlay stops being chrome over
 * video and becomes a toolbar the video happens to be behind. So the resting
 * surface is `controlSurface` at 58%, with a hairline border to keep the edge
 * from dissolving into a bright frame, and it goes almost opaque only when the
 * control is focused or held.
 */

/**
 * What shape the control is, which follows from what it does rather than from
 * where it happens to sit:
 *
 *   pill   Anything with a word or a number in it: "Go live", "1.5x", a track
 *          name in the settings panel.
 *   icon   The icon-only controls -- back, and the option cluster at the top
 *          right. Round, because a row of round buttons at the edge of the
 *          screen reads as chrome, where a row of rounded rectangles reads as a
 *          toolbar.
 *   skip   The two 10-second buttons, which are `icon` at their own size so the
 *          transport row can be sized as a group.
 *   play   The one control reached for without looking, and therefore the
 *          largest thing in the overlay.
 */
export type ControlVariant = 'pill' | 'icon' | 'skip' | 'play';

interface ControlButtonProps {
  /** A shape from `PlayerIcon`, drawn before the label or on its own. */
  icon?: IconName;
  /**
   * Keep the icon's space when there is no icon.
   *
   * For a list of controls where only the current one is ticked: without it the
   * unticked rows sit a tick's width to the left of the ticked one, so the list
   * looks like it indents whichever row happens to be selected.
   */
  reserveIcon?: boolean;
  /** Word label. Omitted on narrow screens by the caller, not by this component. */
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: ControlVariant;
  /**
   * Marks a setting as the one in effect (the current speed, the current audio
   * track), or a mode as switched on (the lock). Different from focus, and it
   * has to look different: focus is where the D-pad is, selection is what the
   * player is doing.
   */
  selected?: boolean;
  disabled?: boolean;
  /** Exactly one control per overlay state should claim initial D-pad focus. */
  hasTVPreferredFocus?: boolean;
  onFocusChange?: (focused: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

export function ControlButton({
  icon,
  reserveIcon = false,
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
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const round = variant !== 'pill';
  const diameter = roundDiameter(variant, chrome);

  /**
   * The icon's tint, which is the same three-state vocabulary as the label's.
   *
   * Computed here rather than left to a style array because `PlayerIcon` takes a
   * colour as a prop: a drawn shape has no `color` to inherit the way a glyph in
   * a `Text` did, which is the one thing the old character-based icons got for
   * free and this trades away for shapes that actually exist.
   */
  const tint =
    focused || selected
      ? colors.accent
      : disabled
      ? colors.textSecondary
      : colors.textPrimary;

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
      hitSlop={metrics.isTouch ? spacing.sm : undefined}
      style={({ pressed }) => [
        styles.base,
        variant === 'pill' ? styles.pill : styles.round,
        round && { width: diameter, height: diameter },
        selected && styles.selected,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <PlayerIcon
            name={icon}
            size={iconSize(variant, chrome)}
            color={tint}
          />
        ) : reserveIcon ? (
          <View style={{ width: iconSize(variant, chrome) }} />
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

/**
 * Both of these are switches over the same four variants rather than two numbers
 * on the props, so a caller cannot ask for a 48dp button holding a 28dp icon.
 * The pairing is a design decision and it belongs with the sizes in
 * `playerLayout.ts`, not at the twelve places a button is used.
 */
function roundDiameter(variant: ControlVariant, chrome: PlayerChrome): number {
  switch (variant) {
    case 'play':
      return chrome.playButton;
    case 'skip':
      return chrome.skipButton;
    default:
      return chrome.iconButton;
  }
}

function iconSize(variant: ControlVariant, chrome: PlayerChrome): number {
  switch (variant) {
    case 'play':
      return chrome.playGlyph;
    case 'skip':
      return chrome.skipGlyph;
    case 'icon':
      return chrome.iconGlyph;
    default:
      // Inside a pill the icon stands next to a word, so it is sized against the
      // text rather than against the button.
      return chrome.glyphSize;
  }
}

const useStyles = makeStyles(metrics => {
  const chrome = resolvePlayerChrome(metrics);

  return {
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      // A transparent border at rest would be the usual trick for "gaining focus
      // must not change the layout", but these buttons need a visible hairline
      // anyway -- see the note on the translucent surface above -- so the border
      // is always drawn and only its colour changes.
      borderWidth: 2,
      borderColor: colors.controlBorder,
      backgroundColor: colors.controlSurface,
    },
    pill: {
      minHeight: chrome.buttonHeight,
      paddingHorizontal: chrome.buttonPaddingH,
      borderRadius: radius.pill,
    },
    round: {
      borderRadius: radius.pill,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    label: {
      ...metrics.typography.body,
      color: colors.textPrimary,
    },
    textActive: {
      color: colors.accent,
    },
    selected: {
      backgroundColor: colors.controlSurfaceOn,
      borderColor: colors.accentMuted,
    },
    focused: {
      borderColor: colors.accent,
      backgroundColor: colors.controlSurfaceActive,
    },
    pressed: {
      // Touch feedback: the surface firms up and the whole control shrinks a
      // touch, the same press language the cards use.
      backgroundColor: colors.controlSurfaceActive,
      transform: [{ scale: metrics.pressScale }],
    },
    disabled: {
      opacity: 0.45,
    },
  };
});
