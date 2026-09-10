import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';

/**
 * A magnifying glass, drawn from two Views.
 *
 * ---------------------------------------------------------------------------
 * Why it is drawn rather than typed or imported
 * ---------------------------------------------------------------------------
 * `player/glyphs.ts` sets the rule this follows: no icon font and no SVG
 * library, because a font asset is a build-config change and a vector library is
 * a native dependency, and neither is worth shipping to a TV to draw a handful
 * of shapes. It also rules out anything from an emoji block -- Android renders
 * those through the colour emoji font, so U+1F50D arrives as a full-colour
 * pictogram at a size and weight nothing else on screen shares.
 *
 * That leaves the geometric characters the player uses, and there is no usable
 * magnifier among them. U+2315 is the closest thing and is not in Roboto's
 * coverage on every Android build, so the failure mode is a tofu box -- which is
 * strictly worse than the word it replaced.
 *
 * A circle and a rotated bar have none of those problems: two Views, no asset,
 * no dependency, identical on every device, and the colour and size are props
 * rather than font metrics.
 *
 * ---------------------------------------------------------------------------
 * This is not a reversal of "labels rather than icons"
 * ---------------------------------------------------------------------------
 * `TabBar` argues for words, and the argument is specifically that the tabs are
 * content KINDS whose distinctions -- anime against films, a channel against
 * either -- have no pictogram anyone would read correctly. Search is the
 * opposite case: the magnifier is the one pictogram that is unambiguous at three
 * metres and at thirty centimetres, and it is what every TV platform already
 * uses for this. The reasoning is unchanged; only the subject is different.
 *
 * ---------------------------------------------------------------------------
 * The geometry
 * ---------------------------------------------------------------------------
 *      0                  size
 *    0 ┌──────────────────┐
 *      │  ╭────╮          │     lens:   a bordered box with a circular radius,
 *      │  │    │          │             anchored top-left
 *      │  ╰────╯╲         │
 *      │         ╲        │     handle: a bar of `stroke` width, rotated -45°,
 * size └──────────────────┘             its midpoint placed on that diagonal
 *
 * Everything is a fraction of `size`, so one number scales the whole shape --
 * stroke included, which is what keeps the lens a ring rather than a blob at a
 * small size. Both callers derive that number from the body type size, so the
 * icon matches the text it stands beside: 17dp in the field, 18dp in the pill
 * where it replaced a word.
 */
export function SearchIcon({
  size = 16,
  color,
}: {
  size?: number;
  /** No default: the caller owns the tint, so it can follow focus. */
  color: string;
}) {
  const styles = useStyles();

  // Rounded to whole dp: a 1.375dp border renders as a soft grey smear rather
  // than a line, and the lens is small enough that it reads as blur.
  const stroke = Math.max(1, Math.round(size / 8));
  const lens = Math.round(size * 0.7);
  const handle = Math.round(size * 0.45);

  /**
   * Where the handle's own centre has to sit for the bar to lie ON the lens's
   * down-right diagonal.
   *
   * This is computed rather than nudged, because eyeballing it does not work.
   * The obvious approach -- anchor the bar to the box's bottom-right with
   * `right`/`bottom` -- puts its centre off the diagonal, so the rotated bar
   * meets the ring at an angle and about a dp short of it: a handle that looks
   * detached and slightly crooked, which at 17dp is a tenth of the whole icon.
   *
   * The lens is anchored top-left with side `lens`, so its centre is at
   * (radius, radius). Walking `radius - stroke / 2` along the unit diagonal from
   * there lands just INSIDE the ring's outer edge, which is what makes the join
   * seamless instead of leaving a hairline. Half the handle further along is its
   * midpoint -- and since React Native rotates a view about its own centre, that
   * midpoint is the one point that does not move when the bar is turned.
   */
  const radius = lens / 2;
  const diagonal = Math.SQRT1_2; // cos(45°), which is also sin(45°)
  const handleMidpoint =
    radius + (radius - stroke / 2) * diagonal + (handle / 2) * diagonal;

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      // One shape, not two elements: without this the circle and the bar are
      // separate nodes to TalkBack, which announces nothing useful for either.
      // The button around it carries the actual accessible name.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.lens,
          {
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            borderWidth: stroke,
            borderColor: color,
          },
        ]}
      />

      <View
        style={[
          styles.handle,
          {
            // Positioned by its centre -- see `handleMidpoint`. `left`/`top`
            // place the box before rotation, so both are offset by half the
            // box's own width and height to put its midpoint on the diagonal.
            left: handleMidpoint - stroke / 2,
            top: handleMidpoint - handle / 2,
            width: stroke,
            height: handle,
            borderRadius: stroke / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

/**
 * Only what does NOT depend on `size` or `color` lives here; the rest has to be
 * inline, since a StyleSheet is built once and every remaining property is a
 * function of the props. Splitting it this way is not only tidiness -- it is
 * also what keeps `react-native/no-inline-styles` quiet, because that rule
 * flags the literal properties of an inline object and ignores computed ones.
 */
const useStyles = makeStyles(() => ({
  // A fixed shape sitting in flex rows -- a pill and a text field. Left to
  // shrink, the lens goes oval.
  root: {
    flexShrink: 0,
  },
  lens: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  handle: {
    position: 'absolute',
    transform: [{ rotate: '-45deg' }],
  },
}));
