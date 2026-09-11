import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { makeStyles } from '../theme';

/**
 * ===========================================================================
 * The player's icons, drawn from Views.
 * ===========================================================================
 * There is no icon font and no SVG library in this project, and the player is
 * not a good enough reason to add one: a font asset is a build-config change, a
 * vector library is a native dependency, and both would ship to a TV to draw a
 * dozen shapes. Anything from an emoji block is out for a different reason --
 * Android renders those through the colour emoji font, so a play button would
 * arrive as a full-colour pictogram at a size and weight nothing else on screen
 * shares.
 *
 * ---------------------------------------------------------------------------
 * Why this replaced the geometric characters it used to be
 * ---------------------------------------------------------------------------
 * The first version of this file was a map of characters -- U+25B6 for play,
 * two U+2759 bars for pause, U+2699 for the gear. That works for the two or
 * three shapes that really are in Roboto, and it fails in three ways as soon as
 * the overlay wants a proper icon set:
 *
 *   Coverage    There is no padlock, no picture-in-picture and no aspect-ratio
 *               character that is reliably in Roboto on every Android build. The
 *               failure mode is a tofu box, which is strictly worse than the
 *               word it replaced -- which is why those controls were words.
 *   Alignment   A glyph sits on a baseline inside an em box it does not fill, so
 *               centring it in a round button is guesswork per character. The
 *               old play button carried `marginLeft: 2` for exactly this.
 *   Weight      Characters come at whatever weight the font drew them. U+25B6 is
 *               a heavy solid triangle and U+2699 is a fine hairline, so a play
 *               button and a settings button next to each other never matched.
 *
 * A View has none of those problems: the shape is the box, so it centres by
 * construction, the weight is `stroke` and therefore uniform across the set, and
 * it renders identically on every device with no asset and no dependency.
 * `components/SearchIcon.tsx` made the same trade for the same reasons.
 *
 * ---------------------------------------------------------------------------
 * The shared geometry
 * ---------------------------------------------------------------------------
 * Every icon is drawn inside a `size` x `size` box and every dimension is a
 * fraction of `size`, so one number scales a shape completely -- stroke
 * included, which is what keeps an outline a line rather than a smear when the
 * same icon is drawn at 14dp in a pill and 26dp in the round play button.
 *
 * `stroke` is rounded to whole dp on purpose. A 1.75dp border does not render as
 * a thin line; it renders as a soft two-pixel grey blur, and on a 16dp icon that
 * is a tenth of the whole shape looking out of focus.
 *
 * Angled parts are built the CSS way -- a box with two of its four borders
 * drawn, then rotated -- rather than from two separate bars. React Native
 * rotates a view about its own centre, so a corner built this way keeps its
 * vertex exactly where the box put it, and the two arms are guaranteed to meet.
 */

export type IconName =
  /** Leave the player. Top-left, on both devices. */
  | 'back'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'forward'
  /** Dismiss a panel. */
  | 'close'
  /** Open the settings panel. */
  | 'settings'
  /** Lock the controls; and the way back out of it. */
  | 'lock'
  | 'unlock'
  /** Cycle the picture size: Fit -> Fill -> Stretch. */
  | 'aspect'
  /** Hand playback to the system's floating window. Touch only. */
  | 'pip'
  /** At the live edge, and the jump back to it. */
  | 'live'
  /** Selected marker in the settings panel. */
  | 'tick';

interface PlayerIconProps {
  name: IconName;
  /** Side of the box the shape is drawn in. Everything scales from it. */
  size: number;
  /** No default: the caller owns the tint, so it can follow focus. */
  color: string;
}

export function PlayerIcon({ name, size, color }: PlayerIconProps) {
  const styles = useStyles();

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      // One shape, not eight elements: without this every View inside a gear is
      // a separate node to TalkBack, which announces nothing useful for any of
      // them. The button around the icon carries the accessible name.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Shape name={name} size={size} color={color} />
    </View>
  );
}

function Shape({ name, size, color }: PlayerIconProps) {
  const styles = useStyles();

  // The line weight of the whole set. See the note on rounding above.
  const stroke = Math.max(1, Math.round(size / 8));

  switch (name) {
    /**
     * A chevron, which is a corner turned 45 degrees.
     *
     *   borders drawn        rotated -45deg
     *     ┌────                  ╱
     *     │            ->       ╱
     *     │                     ╲
     *                            ╲
     *
     * The vertex of a top+left corner points up and to the left; a
     * counter-clockwise quarter-turn of 45 degrees swings it to due left. The
     * box is inset from the icon's own edge because the rotation makes the
     * shape's diagonal, not its side, the thing that has to fit.
     */
    case 'back':
      return (
        <View
          style={[
            styles.chevron,
            {
              width: size * 0.4,
              height: size * 0.4,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
            },
          ]}
        />
      );

    /**
     * A triangle from a zero-sized box with one coloured border.
     *
     * The border-triangle trick, which is the only way to get a diagonal edge
     * without an SVG: a box with no width and no height still draws its
     * borders, and they meet at 45 degrees, so colouring one and leaving its
     * neighbours transparent leaves a triangle pointing away from the coloured
     * side.
     */
    case 'play':
      return <Triangle direction="right" size={size} color={color} />;

    case 'pause':
      return (
        <View style={[styles.row, { gap: size * 0.16 }]}>
          <Bar size={size} color={color} />
          <Bar size={size} color={color} />
        </View>
      );

    /** Two triangles, overlapping by a dp. See `styles.overlap` for why. */
    case 'rewind':
    case 'forward': {
      const direction = name === 'rewind' ? 'left' : 'right';
      const half = size * 0.56;

      return (
        <View style={styles.row}>
          <Triangle direction={direction} size={half} color={color} />
          <Triangle
            direction={direction}
            size={half}
            color={color}
            style={styles.overlap}
          />
        </View>
      );
    }

    /** Two bars across each other. Absolute, so they cross at the centre. */
    case 'close':
      return (
        <>
          <View
            style={[
              styles.slashDown,
              {
                width: size * 0.82,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
          <View
            style={[
              styles.slashUp,
              {
                width: size * 0.82,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
        </>
      );

    /**
     * A gear: a hollow hub with six teeth around it.
     *
     * The obvious construction -- three full-diameter bars crossed at 60 degrees
     * with a ring on top -- does not work here, because the ring's hole has to
     * be transparent (the control sits over moving video, so there is no
     * background colour to fill it with) and the crossed bars show through it as
     * a solid blob. So the teeth are six separate stubs that never reach the
     * middle, and the hub stays genuinely hollow.
     *
     * Each tooth is placed by rotating a full-size wrapper around the icon's
     * centre with the tooth pinned to the top of it. That is deliberately not
     * the same as rotating the tooth and translating it: a transform list
     * composes, so `translateY` after a `rotate` moves along the *rotated* axis,
     * which is easy to reason about wrongly and easier to get right by letting
     * the wrapper carry the angle.
     */
    case 'settings': {
      const ring = size * 0.62;
      const toothWidth = size * 0.18;

      return (
        <>
          {GEAR_ANGLES.map(angle => (
            <View
              key={angle}
              style={[
                styles.spoke,
                { width: size, height: size, transform: [{ rotate: angle }] },
              ]}
            >
              <View
                style={{
                  width: toothWidth,
                  height: size * 0.22,
                  borderRadius: stroke / 2,
                  backgroundColor: color,
                }}
              />
            </View>
          ))}

          <View
            style={{
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              borderWidth: Math.max(stroke, Math.round(size * 0.13)),
              borderColor: color,
            }}
          />
        </>
      );
    }

    /**
     * A padlock: a solid body with a shackle standing on it.
     *
     * The shackle is a bordered box with its bottom border left off and its top
     * two corners fully rounded, which is a semicircle open at the bottom. Its
     * legs overlap the body by a dp so the two shapes read as one object rather
     * than as an arch balanced on a brick.
     */
    case 'lock':
    case 'unlock': {
      const bodyWidth = size * 0.74;
      const bodyHeight = size * 0.5;
      const shackle = size * 0.44;
      const open = name === 'unlock';

      return (
        <View style={[styles.lock, { width: size, height: size }]}>
          <View
            // The sheet entries come last on purpose: they zero the edges the
            // computed `borderWidth` above them sets on all four sides, and a
            // style array resolves later entries over earlier ones.
            style={[
              {
                width: shackle,
                height: shackle * 0.78,
                borderWidth: stroke,
                borderTopLeftRadius: shackle / 2,
                borderTopRightRadius: shackle / 2,
                borderColor: color,
                // Overlaps the body by the stroke, so the arch and the brick
                // read as one object rather than one balanced on the other.
                marginBottom: -stroke,
                // Open: the arch has swung clear of the body, which with the
                // missing right leg is the whole difference between a padlock
                // that is shut and one that is not.
                ...(open ? { marginLeft: shackle * 0.55 } : null),
              },
              styles.shackle,
              open ? styles.shackleOpen : null,
            ]}
          />

          <View
            style={{
              width: bodyWidth,
              height: bodyHeight,
              borderRadius: Math.max(2, Math.round(size * 0.14)),
              backgroundColor: color,
            }}
          />
        </View>
      );
    }

    /**
     * Four corner brackets: the picture-size control.
     *
     * A frame with something inside it was the first attempt and it collided
     * with the picture-in-picture icon, which is also a frame with something
     * inside it. Corners on their own are unmistakably about the edges of the
     * picture, which is exactly what Fit, Fill and Stretch move.
     */
    case 'aspect': {
      const arm = size * 0.3;
      const inset = { vertical: size * 0.08, horizontal: size * 0.05 };

      return (
        <>
          {CORNERS.map(corner => (
            <View
              key={corner.key}
              style={[
                styles.corner,
                { width: arm, height: arm, borderColor: color },
                corner.place(inset, stroke),
              ]}
            />
          ))}
        </>
      );
    }

    /** A screen with a small screen in the corner of it. */
    case 'pip': {
      const frameWidth = size * 0.92;
      const frameHeight = size * 0.72;

      return (
        <View
          style={{
            width: frameWidth,
            height: frameHeight,
            borderWidth: stroke,
            borderRadius: Math.max(2, Math.round(size * 0.12)),
            borderColor: color,
          }}
        >
          <View
            style={[
              styles.inset,
              {
                width: frameWidth * 0.46,
                height: frameHeight * 0.46,
                borderRadius: stroke / 2,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      );
    }

    case 'live':
      return (
        <View
          style={{
            width: size * 0.44,
            height: size * 0.44,
            borderRadius: size * 0.22,
            backgroundColor: color,
          }}
        />
      );

    /**
     * A tick, which is the same corner trick as the chevron with one arm made
     * longer than the other.
     *
     * Which arm ends up long is decided by the box's proportions, and it is
     * easy to get backwards -- it shipped that way. Counter-clockwise by 45
     * degrees swings the LEFT border to the upper left and the BOTTOM border to
     * the upper right, so the bottom border is the one that has to be the long
     * stroke: hence a box that is wider than it is tall. Built the other way up
     * the two arms are the same two arms, mirrored, and a mirrored tick at
     * 14dp does not read as a wrong tick -- it reads as a small `v`, which is
     * what the selected rows in the settings panel were showing.
     */
    case 'tick':
      return (
        <View
          style={[
            styles.chevron,
            {
              width: size * 0.72,
              height: size * 0.4,
              borderBottomWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
              // Rotation happens about the centre of the box and the ink is
              // only along two of its sides, so the finished mark hangs below
              // the centre by about 0.14 of the box. A margin in a centred flex
              // parent moves its child by half itself, so this is that doubled.
              marginBottom: size * 0.28,
            },
          ]}
        />
      );
  }
}

/** Six teeth, evenly spaced. Values are strings because that is what `rotate` takes. */
const GEAR_ANGLES = ['0deg', '60deg', '120deg', '180deg', '240deg', '300deg'];

/**
 * The four corners of the `aspect` icon: where each bracket sits, and which two
 * of its borders are the ones with ink in them.
 *
 * A table rather than four hand-written Views, because they differ only in that
 * pair of sides -- and four near-identical style blocks is four places for a
 * transposed `left`/`right` to hide. `place` returns a real `ViewStyle` rather
 * than the property *names* to assign, since a computed key over a union
 * (`{[corner.vertical]: n}`) widens to a string index signature and stops being
 * a style TypeScript will check.
 */
const CORNERS: {
  key: string;
  place: (
    inset: { vertical: number; horizontal: number },
    stroke: number,
  ) => ViewStyle;
}[] = [
  {
    key: 'top-left',
    place: (inset, stroke) => ({
      top: inset.vertical,
      left: inset.horizontal,
      borderTopWidth: stroke,
      borderLeftWidth: stroke,
    }),
  },
  {
    key: 'top-right',
    place: (inset, stroke) => ({
      top: inset.vertical,
      right: inset.horizontal,
      borderTopWidth: stroke,
      borderRightWidth: stroke,
    }),
  },
  {
    key: 'bottom-left',
    place: (inset, stroke) => ({
      bottom: inset.vertical,
      left: inset.horizontal,
      borderBottomWidth: stroke,
      borderLeftWidth: stroke,
    }),
  },
  {
    key: 'bottom-right',
    place: (inset, stroke) => ({
      bottom: inset.vertical,
      right: inset.horizontal,
      borderBottomWidth: stroke,
      borderRightWidth: stroke,
    }),
  },
];

/**
 * One bar of the pause icon, and the unit the play triangle is sized against so
 * the two shapes look like the same weight when the button swaps between them.
 */
function Bar({ size, color }: { size: number; color: string }) {
  return (
    <View
      style={{
        width: size * 0.22,
        height: size * 0.78,
        borderRadius: Math.max(1, Math.round(size * 0.06)),
        backgroundColor: color,
      }}
    />
  );
}

/**
 * A triangle, from the border trick described on `case 'play'`.
 *
 * Slightly narrower than it is tall (0.86), which is what makes a play triangle
 * look upright rather than squat -- an equilateral triangle in a square box
 * reads as wide, because the eye measures it by the long horizontal base.
 */
function Triangle({
  direction,
  size,
  color,
  style,
}: {
  direction: 'left' | 'right';
  size: number;
  color: string;
  style?: ViewStyle;
}) {
  const styles = useStyles();
  const height = size * 0.8;
  const width = height * 0.86;

  return (
    <View
      style={[
        styles.triangle,
        {
          borderTopWidth: height / 2,
          borderBottomWidth: height / 2,
          ...(direction === 'right'
            ? { borderLeftWidth: width, borderLeftColor: color }
            : { borderRightWidth: width, borderRightColor: color }),
        },
        style,
      ]}
    />
  );
}

/**
 * Only what does NOT depend on `size` or `color` lives here; the rest has to be
 * inline, since a StyleSheet is built once and every remaining property is a
 * function of the props. Splitting it this way is not only tidiness -- it is
 * also what keeps `react-native/no-inline-styles` quiet, because that rule flags
 * the literal properties of an inline object and ignores computed ones.
 */
const useStyles = makeStyles(() => ({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    // A fixed shape sitting inside flex rows. Left to shrink, every circle in
    // the set goes oval.
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    transform: [{ rotate: '-45deg' }],
  },
  triangle: {
    width: 0,
    height: 0,
    // The two borders adjacent to the coloured one have to exist and be
    // invisible: they are what the coloured edge is mitred against, so dropping
    // them leaves a rectangle rather than a triangle.
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  slashDown: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
  slashUp: {
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
  },
  spoke: {
    position: 'absolute',
    alignItems: 'center',
  },
  lock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shackle: {
    borderBottomWidth: 0,
  },
  shackleOpen: {
    borderRightWidth: 0,
  },
  /**
   * Pulls the second triangle of a rewind / forward arrow onto the first.
   *
   * Butted exactly together the two hypotenuses are antialiased against each
   * other and leave a pale seam down the join, which reads as a notch in one
   * arrow rather than as two.
   */
  overlap: {
    marginLeft: -1,
  },
  corner: {
    position: 'absolute',
  },
  inset: {
    position: 'absolute',
    right: 1,
    bottom: 1,
  },
}));
