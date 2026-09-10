import React from 'react';
import { Text, View } from 'react-native';

import { colors, makeStyles, radius, spacing } from '../theme';
import { Focusable } from './Focusable';

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

function contentTint(selected: boolean, active: boolean): string {
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
        // Content-only pills are square-ish rather than wide: the horizontal
        // padding a word needs would leave a 16dp glyph swimming in a 56dp pill.
        children && label === undefined && styles.buttonIconOnly,
        selected && styles.buttonSelected,
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {active => (
        <View style={styles.content}>
          {children ? children(contentTint(selected, active)) : null}

          {label !== undefined ? (
            <Text
              style={[
                styles.label,
                selected && styles.labelSelected,
                active && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          ) : null}
        </View>
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...m.typography.body,
    color: tint.rest,
  },
  labelSelected: {
    color: tint.selected,
  },
  labelActive: {
    color: tint.active,
  },
}));
