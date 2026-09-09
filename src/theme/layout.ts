import {Dimensions} from 'react-native';

/**
 * TV layout constants.
 *
 * ---------------------------------------------------------------------------
 * The one number to internalise: an Android TV screen is ~960 x 540 dp.
 * ---------------------------------------------------------------------------
 * A 1080p TV reports density 2.0, and a 4K TV reports 4.0, so BOTH present a
 * logical viewport of roughly 960 x 540 dp. Every size in this file is dp
 * against that space, which is why the numbers look small next to phone values:
 * a 120dp poster is 240 physical pixels on a 1080p panel and 480 on a 4K one.
 *
 * Practical consequence: sizes that feel right on a phone are roughly half of
 * what you want here, and font sizes that look large in a phone preview are
 * correct at three metres.
 */

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

export const screen = {width: screenWidth, height: screenHeight};

/**
 * Overscan safe area.
 *
 * Many TVs, especially older sets, crop a few percent off every edge and cannot
 * be told not to. Anything inside this margin may simply not be on the glass.
 * The platform will not tell you about it -- safe-area insets are 0 on TV, since
 * there are no system bars -- so it has to be a design constant. 5% per edge is
 * the standard allowance.
 */
export const overscan = {
  horizontal: 48,
  vertical: 27,
} as const;

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

/**
 * Card geometry per variant. Height excludes the caption below the artwork;
 * ContentCard adds that itself.
 */
export const cardSize = {
  /** 2:3 movie poster. */
  poster: {width: 124, height: 186},
  /** 16:9 thumbnail, for channels and events. */
  landscape: {width: 168, height: 94},
  /** Square, for channel logos in a dense grid. */
  square: {width: 116, height: 116},
} as const;

export type CardVariant = keyof typeof cardSize;

/**
 * How much a card grows when focused. Kept small on purpose: a big jump on a
 * 55-inch panel is unpleasant, and anything above ~1.1 makes neighbouring cards
 * visibly shift.
 */
export const focusScale = 1.07;

/** Space around each card, sized so the focus ring and scale never clip. */
export const cardGap = spacing.md;

/**
 * Fixed width a ContentCard adds around its artwork: its own padding plus the
 * focus-ring border, on both sides.
 *
 * Exported because any screen laying out a grid has to subtract it to work out a
 * fluid card width. Hard-coding "about 12" at the call site is how a grid ends
 * up one column too wide, with the last column clipped off-screen and therefore
 * unreachable by the D-pad.
 */
export const cardChrome = spacing.xs * 2 + 2 * 2;
