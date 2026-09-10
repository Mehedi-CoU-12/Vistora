import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';
import type { ScrimEdge } from './playerLayout';

/**
 * The gradient behind the controls at one edge of the screen.
 *
 * See `resolveScrimHeights` for why there are two of these rather than one
 * full-screen wash, how tall each one is, and what `hold` is for.
 *
 * ---------------------------------------------------------------------------
 * A real gradient, not a stack of bands
 * ---------------------------------------------------------------------------
 * This project has no gradient library and does not want one, which used to mean
 * the only way to draw a ramp was a column of ten or twelve Views each a step
 * darker than the last. That works and it looks like what it is: the steps show
 * as horizontal bands wherever the picture behind them is flat, which over a
 * night sky is most of the time.
 *
 * React Native 0.87 draws gradients natively through the `backgroundImage`
 * style, so the ramp is one View and one shader with no banding and no
 * dependency. It needs the New Architecture, which this app already requires
 * (`newArchEnabled=true`); on the old renderer the property is ignored and the
 * scrim renders as nothing at all, so if the controls ever lose their backing
 * this is the first thing to check.
 */

/**
 * The shape of the fade, as alpha against distance along the ramp.
 *
 * `at` is a position in the ramp only -- 0 is where the held region ends, 1 is
 * where the scrim reaches nothing -- so the curve is the same whether it is
 * spending 48dp on a phone or 48dp on a TV, and it does not stretch when the
 * controls above it get taller.
 *
 * Eased rather than linear, because a straight line does not look like one. The
 * midpoint is the giveaway: 45% black across the middle of a fade is plenty to
 * see as a grey veil and not nearly enough to make text legible, so a two-stop
 * scrim manages both to dim the picture and to fail at its job. Dropping most of
 * the tone in the first third of the ramp and trailing the rest out is what
 * reads as "the controls sit on something" rather than "the top of the screen is
 * darker".
 */
const RAMP: { alpha: number; at: number }[] = [
  { alpha: 0.78, at: 0 },
  { alpha: 0.44, at: 0.3 },
  { alpha: 0.16, at: 0.6 },
  { alpha: 0, at: 1 },
];

/** Alpha over the held region: dark enough for white text on a white frame. */
const HELD_ALPHA = 0.88;

/**
 * The scrim's colour, as an `r, g, b` triple.
 *
 * Deliberately not pure black: it is the same near-navy as `colors.background`,
 * so the controls sit on a darkened continuation of the app's own surface rather
 * than under a grey cast that belongs to no palette. Kept as a string fragment
 * because each stop needs its own alpha, and `colors` holds finished colours.
 */
const SCRIM_RGB = '4, 6, 12';

export function Scrim({
  edge,
  geometry,
}: {
  edge: 'top' | 'bottom';
  geometry: ScrimEdge;
}) {
  const styles = useStyles();
  const { height, hold } = geometry;

  if (height <= 0) {
    return null;
  }

  const tail = 1 - hold;

  /**
   * Full strength from the screen edge to the end of the controls, then the
   * ramp -- whose stops are mapped from their position along the ramp to their
   * position down the whole scrim.
   */
  const stops = [
    { alpha: HELD_ALPHA, at: 0 },
    { alpha: HELD_ALPHA, at: hold },
    ...RAMP.map(stop => ({ alpha: stop.alpha, at: hold + tail * stop.at })),
  ];

  return (
    <View
      // Purely decorative, and it covers the whole width of the screen: without
      // this it would eat every tap and swipe in the strip the controls live in,
      // which is where a scrub gesture usually starts.
      pointerEvents="none"
      style={[
        styles.layer,
        edge === 'top' ? styles.top : styles.bottom,
        {
          height,
          backgroundImage: [
            {
              type: 'linear-gradient' as const,
              // `to bottom` puts the first stop at the top edge, so the bottom
              // scrim -- darkest at the *bottom* -- runs the same ramp the other
              // way rather than keeping a second, reversed copy of it in sync.
              direction: edge === 'top' ? 'to bottom' : 'to top',
              colorStops: stops.map(stop => ({
                color: `rgba(${SCRIM_RGB}, ${stop.alpha})`,
                positions: [`${(stop.at * 100).toFixed(2)}%`],
              })),
            },
          ],
        },
      ]}
    />
  );
}

const useStyles = makeStyles(() => ({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
}));
