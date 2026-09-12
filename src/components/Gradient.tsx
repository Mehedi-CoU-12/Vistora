import React, { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A linear gradient.
 *
 * ---------------------------------------------------------------------------
 * No dependency, and no longer a stack of rectangles either
 * ---------------------------------------------------------------------------
 * Gradients are the load-bearing visual in this UI -- every hero, the chrome
 * backing and the primary button is one -- so it is worth saying exactly what
 * this does and why it is not `react-native-linear-gradient`.
 *
 * React Native 0.76 added CSS `background-image` with `linear-gradient()`, and
 * the fork this app builds against ships the Android half of it (see
 * ReactAndroid/.../uimanager/style/LinearGradient.kt in the installed package).
 * So the platform draws a real gradient, on the GPU, in one view, with no native
 * module to keep building against the tvOS fork on two ABIs forever.
 *
 * ---------------------------------------------------------------------------
 * What this replaced, and why the first attempt was not good enough
 * ---------------------------------------------------------------------------
 * The first version of this file approximated a ramp with a stack of solid
 * Views, each filled with the colour at its own midpoint. That is the standard
 * no-dependency trick, and on the near-black scrims that make up most of the app
 * it was genuinely invisible.
 *
 * It was not invisible where it mattered most. Measured off a screenshot of the
 * running app, the hero's bottom fade -- around 200dp of ramp over a brightly
 * lit backdrop -- showed its steps as horizontal lines about 6dp apart, because
 * an alpha step of 1/32 over a bright frame is a jump of five to seventeen
 * levels per channel. Hiding that would have taken on the order of a hundred
 * Views for one gradient, to get a result the platform draws properly in one.
 *
 * The lesson worth keeping: the banded version was fine everywhere it was cheap
 * to check, and wrong in the one place the whole design depended on it.
 *
 * ---------------------------------------------------------------------------
 * Easing, and why the default is not linear
 * ---------------------------------------------------------------------------
 * A linear alpha ramp over a photograph looks wrong: the eye reads brightness
 * roughly logarithmically, so a straight line from opaque to transparent appears
 * to clear too early and then linger as a grey haze over the top of the image.
 *
 * CSS interpolates linearly between colour stops, so `ease` is expressed as
 * extra stops placed along a squared curve -- the colour at position `p` is the
 * ramp's colour at `p * p`. Eight stops is plenty: the platform interpolates
 * continuously between them, so the result is smooth regardless, and the stops
 * only have to be dense enough to follow the curve's shape.
 */

export type GradientDirection = 'down' | 'up' | 'left' | 'right';

interface GradientProps {
  /**
   * The ramp, from the start of `direction` to its end. Two or more colours;
   * any CSS-ish form the palette uses (`#RGB`, `#RRGGBB`, `rgba(...)`).
   */
  colors: readonly string[];
  /** Which way the ramp runs. Defaults to 'down'. */
  direction?: GradientDirection;
  /**
   * Shape of the ramp between colours.
   *
   * 'ease' (the default) is quadratic and is what a scrim over a photograph
   * wants. 'linear' is correct when the gradient IS the subject -- the brand
   * sweep behind the Play button -- where the eye is comparing the two ends
   * rather than trying to read through the middle.
   */
  easing?: 'ease' | 'linear';
  /**
   * Where to put it. Almost always an absolute fill plus an edge inset, since a
   * gradient is a treatment over something rather than a box in a layout.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Drawn on top of the ramp, in normal flow, and sizing it -- so a gradient
   * with children is a filled box (a brand button) rather than an overlay.
   *
   * Passing children switches `pointerEvents` to 'auto' unless told otherwise:
   * an overlay must never eat a press meant for the card underneath it, but a
   * button made of one obviously has to receive its own.
   */
  children?: React.ReactNode;
  pointerEvents?: ViewStyle['pointerEvents'];
}

/** A colour as numbers, so two of them can be mixed. */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/**
 * Parses the colour forms this codebase uses. Anything unrecognised becomes
 * transparent rather than throwing: a mistyped colour should be a gradient that
 * visibly does nothing, not a screen that fails to render.
 */
function parseColor(input: string): Rgba {
  const value = input.trim();

  if (value.startsWith('#')) {
    const hex = value.slice(1);

    // #RGB shorthand: each digit is doubled, so 'f0a' is 'ff00aa'.
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }

    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }

    return TRANSPARENT;
  }

  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );

  // Includes the keyword 'transparent', which is exactly the fallback anyway.
  if (!match) {
    return TRANSPARENT;
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/**
 * Mixes two colours.
 *
 * Note that RGB is interpolated alongside alpha rather than premultiplied. That
 * is the right call here and wrong in general: a fully transparent colour has no
 * meaningful RGB, so mixing `rgba(11,13,20,1)` with `transparent` (which parses
 * to black) would drag the midpoint toward #000 and put a dark band across the
 * middle of every fade. The palette avoids this by fading to
 * `backgroundAlpha(0)` -- the page colour at zero alpha -- rather than to the
 * keyword `transparent`, which keeps the RGB constant the whole way down.
 */
function mix(from: Rgba, to: Rgba, t: number): string {
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  const a = from.a + (to.a - from.a) * t;

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

/**
 * Colour at position `t` (0..1) along a ramp of any number of stops, evenly
 * spaced. Two colours is the common case; three is what the hero's bottom fade
 * uses, so it can stay clear through the middle and reach the page colour early
 * enough that the rail below it emerges from solid ground.
 */
function sample(stops: Rgba[], t: number): string {
  if (stops.length === 1) {
    return mix(stops[0], stops[0], 0);
  }

  const scaled = t * (stops.length - 1);
  // `- 1` so t === 1 lands in the last segment at local position 1 rather than
  // indexing one past the end.
  const index = Math.min(Math.floor(scaled), stops.length - 2);

  return mix(stops[index], stops[index + 1], scaled - index);
}

/** How many stops an eased ramp is expressed with. See the header. */
const EASE_STOPS = 8;

const CSS_DIRECTION: Record<GradientDirection, string> = {
  down: 'to bottom',
  up: 'to top',
  right: 'to right',
  left: 'to left',
};

/**
 * The CSS `linear-gradient(...)` for a ramp, as a pure function.
 *
 * Split out of the component so the arithmetic can be checked in a unit test
 * rather than by looking at a television -- the same reason `resolveMetrics` and
 * `computeCardWidth` are pure. What a test can pin here is exactly what the eye
 * is worst at judging on a near-black ramp: that the ends are the colours asked
 * for, that the hue does not wander when only the alpha changes, and that easing
 * redistributes the ramp rather than darkening it.
 */
export function linearGradient(
  colors: readonly string[],
  direction: GradientDirection,
  easing: 'ease' | 'linear',
): string {
  const parsed = colors.map(parseColor);

  const stops =
    easing === 'linear'
      ? parsed.map((_, index) =>
          stopAt(parsed, parsed.length === 1 ? 0 : index / (parsed.length - 1)),
        )
      : Array.from({ length: EASE_STOPS }, (_, index) => {
          const position = index / (EASE_STOPS - 1);
          // The colour AT `p` is the ramp's colour at `p * p` -- the stop keeps
          // its own position and takes an eased colour, which is what bends the
          // curve without moving where it starts and ends.
          return `${sample(parsed, position * position)} ${percent(position)}`;
        });

  return `linear-gradient(${CSS_DIRECTION[direction]}, ${stops.join(', ')})`;
}

function stopAt(parsed: Rgba[], position: number): string {
  return `${sample(parsed, position)} ${percent(position)}`;
}

function percent(position: number): string {
  return `${(position * 100).toFixed(2)}%`;
}

export function Gradient({
  colors,
  direction = 'down',
  easing = 'ease',
  style,
  children,
  pointerEvents,
}: GradientProps) {
  const backgroundImage = useMemo(
    () => linearGradient(colors, direction, easing),
    [colors, direction, easing],
  );

  return (
    <View
      style={[style, { backgroundImage }]}
      pointerEvents={pointerEvents ?? (children ? 'auto' : 'none')}
    >
      {children}
    </View>
  );
}
