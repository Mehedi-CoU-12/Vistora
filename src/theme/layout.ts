/**
 * Layout constants that do NOT depend on the device.
 *
 * Anything that changes between a TV, a tablet and a phone -- screen padding,
 * card sizes, grid columns, type sizes -- lives in `metrics.ts` and is read
 * through `useMetrics()`. This file holds only the values that are the same
 * everywhere: the spacing rhythm, the corner radii, and the shape of a card.
 *
 * Keeping the split strict is what stops a stale `Dimensions.get()` snapshot
 * leaking into a StyleSheet: a module-scope constant cannot react to a rotation,
 * so no module-scope constant is allowed to know the screen size.
 */

/**
 * The spacing rhythm, in dp, shared by every device.
 *
 * These are deliberately not scaled per device. A 12dp gap is a 12dp gap: on a
 * TV it reads as a tight gutter between cards at three metres, and on a phone it
 * reads as a tight gutter between cards at thirty centimetres. What has to
 * change with the screen is the size of the *content* (see `metrics.ts`), not
 * the rhythm between pieces of it.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export type CardVariant = 'poster' | 'landscape' | 'square';

/**
 * Artwork shape per variant, as height / width.
 *
 * The aspect ratio is the invariant; the width is not. A poster is 2:3 on every
 * screen ever made, so `ContentCard` derives its height from whatever width the
 * current layout gives it rather than from a stored pixel height. That is what
 * lets the same component render a 124dp poster on a TV and a 116dp one on a
 * phone without stretching the artwork.
 */
export const cardAspect: Record<CardVariant, number> = {
  /** 2:3 movie poster. */
  poster: 3 / 2,
  /** 16:9 thumbnail, for channels and events. */
  landscape: 9 / 16,
  /** Square, for channel logos in a dense grid. */
  square: 1,
};

/**
 * Fixed width a ContentCard adds around its artwork: its own padding plus the
 * focus-ring border, on both sides.
 *
 * Exported because any layout dividing a measured width between cards has to
 * subtract it. Hard-coding "about 12" at the call site is how a grid ends up one
 * column too wide, with the last column clipped off-screen and therefore
 * unreachable by the D-pad.
 */
export const cardChrome = spacing.xs * 2 + 2 * 2;
