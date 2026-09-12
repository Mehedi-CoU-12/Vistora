import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { Focusable } from './Focusable';
import { Gradient } from './Gradient';

/**
 * The three shapes this button comes in.
 *
 * `pill` is the original and still the default: a quiet surface-coloured pill
 * for chrome -- the top bar's search toggle, a Reload in an empty state.
 *
 * `primary` and `secondary` exist for one situation, the pair of actions under a
 * hero or on a details screen, and they are a pair rather than two independent
 * styles. The whole job of that pair is to say which of the two is the thing to
 * press: Play is filled with the brand sweep and carries dark text, My List is a
 * translucent panel with a hairline. Introducing either on its own would lose
 * that contrast, which is why they are one union and not two booleans.
 */
export type ButtonVariant = 'pill' | 'primary' | 'secondary';

/**
 * The brand sweep, left to right, behind a primary action.
 *
 * Violet into cyan rather than the logo's full cyan-blue-violet-magenta range:
 * a button is 120dp wide and a four-stop ramp across it reads as a smear. These
 * are the two ends that are furthest apart in hue while both staying dark
 * enough for `textOnAccent` to hold its contrast on top.
 */
const PRIMARY_SWEEP = [colors.brandViolet, colors.brandCyan] as const;

/**
 * The pill's three content colours, in precedence order: focus beats selection
 * beats rest.
 *
 * Declared here rather than only in the stylesheet because custom content (an
 * icon) has to be tinted with the colour the label would have taken, and it
 * receives that colour as a prop -- React Native has no `currentColor`. Reading
 * both from this one object is what stops an icon and the word beside it
 * disagreeing.
 */
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
  // A primary button's fill is the brand gradient, so its content is dark and
  // stays dark: brightening it on focus would reduce contrast rather than raise
  // it, and the ring around it is already saying where the D-pad is.
  if (variant === 'primary') {
    return colors.textOnAccent;
  }
  if (variant === 'secondary') {
    return active ? colors.textPrimary : colors.textOnArt;
  }
  return active ? tint.active : selected ? tint.selected : tint.rest;
}

/**
 * Props, with one constraint expressed in the type: a button has to have an
 * accessible name.
 *
 * `label` supplies one for free, so a labelled button needs nothing else. An
 * icon-only button has no text at all, and TalkBack would announce it as
 * "button" -- so for that shape `accessibilityLabel` is required rather than
 * optional. Getting it wrong is a compile error instead of a defect nobody
 * using their eyes would ever notice.
 */
type TextButtonProps = {
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  /**
   * Marks the button as the mode the app is currently in -- used by the top
   * bar's Search pill while search is open.
   *
   * Drawn as a fill, not as the focus ring, and with the same two colours
   * `TabBar` gives a selected tab. That is the whole point: selection says what
   * the app is showing and focus says where the D-pad is, so on a TV the two
   * are visible at once and constantly disagree. A button that showed "selected"
   * by borrowing the ring would be indistinguishable from the one the remote
   * happens to be sitting on.
   */
  selected?: boolean;
  /** See `ButtonVariant`. Defaults to 'pill'. */
  variant?: ButtonVariant;
  /**
   * Let the button fill the width it is given rather than hugging its label.
   *
   * Used by the hero on a phone in portrait, where two actions share one row and
   * an unstretched pair leaves a gap on the right that reads as a layout bug.
   */
  stretch?: boolean;
  /**
   * Custom content -- in practice an icon -- drawn before the label, or alone.
   *
   * A function of the current content colour, which is the same render-prop
   * shape `Focusable` uses for the same reason: the child needs a piece of the
   * parent's interaction state, and duplicating the focus tracking to get it
   * would let the two drift apart.
   */
  children?: (color: string) => React.ReactNode;
} & (
  | { label: string; accessibilityLabel?: string }
  | { label?: undefined; accessibilityLabel: string }
);

/**
 * A pill button. Interaction styling comes from Focusable, so it matches every
 * card on both a remote and a finger.
 */
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
        // Content-only pills are square-ish rather than wide: the horizontal
        // padding a word needs would leave a 16dp glyph swimming in a 56dp pill.
        children && label === undefined && styles.buttonIconOnly,
        selected && variant === 'pill' && styles.buttonSelected,
        stretch && styles.buttonStretch,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {active => (
        <>
          {/* A SIBLING of the content, not a child of it, and that is the
              whole trick: an absolutely-filled view resolves against its
              parent, so nested inside `content` the sweep would stop at the
              label's box and leave the button's padding unpainted. Out here
              its parent is the Pressable, so it fills the button. Drawn first,
              so the content paints over it without needing a z-index. */}
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
    // A remote can land on a 28dp-tall pill precisely; a fingertip cannot.
    minHeight: m.minTouchTarget,
    justifyContent: 'center',
  },
  buttonIconOnly: {
    paddingHorizontal: spacing.md,
    // Square, so the pill radius reads as a circle around the glyph. Without a
    // minimum width the pill would come out narrower than it is tall, since an
    // icon is smaller than a line of body text. `||` rather than `??` because
    // the metric is 0 on TV, which has no touch minimum to respect.
    minWidth: m.minTouchTarget || 40,
    alignItems: 'center',
  },
  buttonSelected: {
    backgroundColor: colors.accentMuted,
  },
  /**
   * No background of its own: the gradient inside supplies it. `overflow:
   * hidden` is what clips that gradient to the pill radius -- without it the
   * sweep renders as a rectangle behind a rounded button.
   */
  buttonPrimary: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
  },
  /**
   * Translucent rather than `surface`, because this button's whole purpose is
   * to sit on a hero backdrop. A solid tile there is a hole in the picture; at
   * two thirds opacity with a hairline the shape still reads against a bright
   * frame and the artwork keeps showing through.
   */
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
