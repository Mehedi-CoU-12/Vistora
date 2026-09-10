import {Platform} from 'react-native';

import {cardAspect, cardChrome, type CardVariant} from './layout';
import {scaleTypography, type Typography} from './typography';

/**
 * ===========================================================================
 * Every size that depends on the screen is resolved here, and nowhere else.
 * ===========================================================================
 *
 * The app runs on two genuinely different devices:
 *
 *   TV      ~960 x 540 dp, landscape, driven by a D-pad from three metres away.
 *   Phone   ~390 x 844 dp, usually portrait, driven by a finger from thirty cm.
 *
 * Those are not the same layout with different padding -- a 216dp sidebar is a
 * quarter of a TV screen and more than half a phone screen -- so the difference
 * is resolved once, into a `Metrics` object, and read through `useMetrics()`.
 *
 * The rule that keeps this honest: no module-scope constant may know the screen
 * size. `Dimensions.get('window')` at import time is a snapshot taken before the
 * first render and never updated, so a rotation leaves every StyleSheet built
 * from it silently wrong. Everything below is a pure function of the window size
 * that the provider re-runs when the window changes.
 */

export type DeviceClass = 'tv' | 'tablet' | 'phone';
export type Orientation = 'landscape' | 'portrait';

/** Where the tab bar sits. See `resolveNavPlacement`. */
export type NavPlacement = 'top' | 'bottom';

/**
 * The layouts we actually design for. Orientation matters on a touch device and
 * is meaningless on a TV, which is why TV is a single key rather than two.
 */
type LayoutKey =
  | 'tv'
  | 'tablet-landscape'
  | 'tablet-portrait'
  | 'phone-landscape'
  | 'phone-portrait';

/** Shortest screen edge, in dp, at or above which a device counts as a tablet. */
const TABLET_MIN_SHORTEST_SIDE = 600;

/**
 * Content width, in dp, at or above which Live TV keeps its category sidebar.
 *
 * Below it the sidebar is replaced by a horizontal chip rail above the grid.
 * The threshold is on the *content* width rather than the device class on
 * purpose: what decides the question is whether 176dp of sidebar still leaves a
 * usable grid, and a phone held in landscape passes that test while the same
 * phone in portrait does not.
 */
const SIDEBAR_MIN_CONTENT_WIDTH = 700;

/** Floor for a computed card width, so a very narrow window cannot go negative. */
const MIN_CARD_WIDTH = 72;

export interface CardSize {
  width: number;
  height: number;
}

export interface Metrics {
  device: DeviceClass;
  orientation: Orientation;
  /** True on Android TV. The single source of truth for "is this a 10-foot UI". */
  isTV: boolean;
  /** True where the input device is a finger rather than a D-pad. */
  isTouch: boolean;
  width: number;
  height: number;
  /**
   * Padding between the content and the edge of the screen.
   *
   * On TV this is the overscan allowance: many panels crop a few percent off
   * every edge and cannot be told not to, and the platform never reports it
   * (safe-area insets are zero on TV, since there are no system bars), so it has
   * to be a design constant. 5% per edge is the standard allowance.
   *
   * On a phone it is just a margin, and much smaller -- 48dp of overscan on a
   * 390dp screen would eat a quarter of the width for nothing, since a phone
   * crops no pixels. System bars and cutouts are handled separately, from the
   * real safe-area insets, in `ScreenContainer`.
   */
  gutter: {horizontal: number; vertical: number};
  /** Width inside the gutter: what a layout actually gets to fill. */
  contentWidth: number;
  typography: Typography;
  cardSize: Record<CardVariant, CardSize>;
  /** How much a card grows when the D-pad focuses it. 1 on a touch device. */
  focusScale: number;
  /** How much a card shrinks while a finger is held on it. 1 on TV. */
  pressScale: number;
  /**
   * Columns in a catalog grid, per card variant.
   *
   * Per-variant rather than one number, because the variants are different
   * shapes: at the width that fits two 16:9 channel tiles across a phone, three
   * 2:3 posters fit and look right. A single count for both would either waste
   * a third of the width on posters or clip the channel tiles.
   */
  gridColumns: Record<CardVariant, number>;
  /**
   * Where the tab bar sits: a rail across the top, or a bar along the bottom.
   */
  navPlacement: NavPlacement;
  /** Whether Live TV shows a category sidebar (true) or a chip rail (false). */
  usesSidebar: boolean;
  sidebarWidth: number;
  /**
   * Minimum height for a tappable control, or 0 on TV.
   *
   * A remote needs no minimum: focus can land on a 20dp-tall button perfectly
   * accurately. A finger needs ~48dp, which is why the player's controls are
   * visibly chunkier on a phone than on a TV.
   */
  minTouchTarget: number;
}

const GUTTER: Record<LayoutKey, {horizontal: number; vertical: number}> = {
  // 5% of 960 x 540 -- the standard TV overscan allowance.
  tv: {horizontal: 48, vertical: 27},
  'tablet-landscape': {horizontal: 32, vertical: 24},
  'tablet-portrait': {horizontal: 32, vertical: 24},
  'phone-landscape': {horizontal: 24, vertical: 12},
  'phone-portrait': {horizontal: 16, vertical: 12},
};

/**
 * The verified TV card widths, in dp. Fixed rather than fluid, deliberately.
 *
 * Every Android TV presents ~960dp regardless of whether the panel is 1080p or
 * 4K, so there is nothing for a fluid width to adapt to -- and these exact
 * numbers are the ones checked on a real device, with the row density and focus
 * ring they were tuned for. Deriving them from the viewport would put that
 * behind an arithmetic that a panel reporting 906dp or 1280dp could change.
 */
const TV_CARD_WIDTH: Record<CardVariant, number> = {
  poster: 124,
  landscape: 168,
  square: 116,
};

/**
 * How many cards of each variant fit across the content width, on touch devices.
 *
 * Fractional on purpose. A partly visible card at the right edge is the
 * strongest affordance available for "this row scrolls" -- and on a phone it is
 * the *only* one, because there is no D-pad to nudge and discover with. Whole
 * numbers here would produce rows that end flush with the screen edge and look
 * complete when they are not.
 */
const CARDS_ACROSS: Record<Exclude<LayoutKey, 'tv'>, Record<CardVariant, number>> = {
  'tablet-landscape': {poster: 6.2, landscape: 4.4, square: 6.8},
  'tablet-portrait': {poster: 4.6, landscape: 3.2, square: 5},
  // Vertical space is the scarce resource in phone landscape -- a 390dp-tall
  // window has room for about one row -- so cards run narrower here than in
  // portrait to keep a poster's 3:2 height down.
  'phone-landscape': {poster: 7, landscape: 4.2, square: 7.5},
  'phone-portrait': {poster: 2.8, landscape: 1.9, square: 3.4},
};

/**
 * Columns in a catalog grid, per layout and per card variant.
 *
 * Whole numbers here, unlike `CARDS_ACROSS` above -- and for the opposite
 * reason. A horizontal shelf wants a fractional last card as its "there is more
 * this way" cue; a grid scrolls vertically, so its cue is the next ROW peeking
 * in at the bottom, and a fractional column would just clip artwork at the
 * right edge for nothing.
 */
const GRID_COLUMNS: Record<LayoutKey, Record<CardVariant, number>> = {
  tv: {poster: 5, landscape: 4, square: 6},
  'tablet-landscape': {poster: 5, landscape: 4, square: 6},
  'tablet-portrait': {poster: 4, landscape: 3, square: 5},
  // Vertical space is what a phone held sideways is short of, so this layout
  // takes MORE columns than portrait, not fewer: a poster four across would be
  // 207dp tall in a 390dp window, so one row would fill the screen.
  'phone-landscape': {poster: 6, landscape: 4, square: 7},
  'phone-portrait': {poster: 3, landscape: 2, square: 4},
};

/** See the note on headline scaling in `typography.ts`. */
const HEADLINE_SCALE: Record<DeviceClass, number> = {
  tv: 1,
  tablet: 0.92,
  phone: 0.78,
};

/** Wide enough for real category names ("Entertainment") without an ellipsis. */
const SIDEBAR_WIDTH: Record<DeviceClass, number> = {
  tv: 216,
  tablet: 184,
  phone: 176,
};

function layoutKey(device: DeviceClass, orientation: Orientation): LayoutKey {
  return device === 'tv' ? 'tv' : `${device}-${orientation}`;
}

/**
 * Divides the content width into `across` card slots.
 *
 * A horizontal row has no explicit gap between cards: each card's own padding
 * and focus-ring border (`cardChrome`) provides the space, so the slot a card
 * occupies is its artwork width plus that chrome. Forgetting the chrome is how a
 * row ends up one card wider than it can show.
 */
function fluidCardWidth(across: number, contentWidth: number): number {
  return Math.max(MIN_CARD_WIDTH, Math.floor(contentWidth / across) - cardChrome);
}

function resolveCardSizes(
  key: LayoutKey,
  contentWidth: number,
): Record<CardVariant, CardSize> {
  const sizes = {} as Record<CardVariant, CardSize>;

  for (const variant of Object.keys(cardAspect) as CardVariant[]) {
    const width =
      key === 'tv'
        ? TV_CARD_WIDTH[variant]
        : fluidCardWidth(CARDS_ACROSS[key][variant], contentWidth);

    // Height always comes from the aspect ratio, never from a stored number, so
    // artwork keeps its shape at any width.
    sizes[variant] = {width, height: Math.floor(width * cardAspect[variant])};
  }

  return sizes;
}

/**
 * Decides where the tab bar goes.
 *
 * Bottom, under the thumb, is right on a touch device held upright -- and only
 * there. A television has no thumb: focus reaches the bar by pressing UP out of
 * the content, which is the top of the screen by definition. And any landscape
 * window is short of height rather than width, where a 56dp bar across the
 * bottom would spend a seventh of a phone's 390dp on navigation nobody is
 * looking at, next to a row of cards that has nowhere to grow.
 */
function resolveNavPlacement(isTV: boolean, orientation: Orientation): NavPlacement {
  return !isTV && orientation === 'portrait' ? 'bottom' : 'top';
}

/**
 * Turns a window size into every screen-dependent value the app needs.
 *
 * Pure, and exported separately from the hook so it can be unit-tested against
 * arbitrary viewports without rendering anything.
 */
export function resolveMetrics(width: number, height: number): Metrics {
  const isTV = Platform.isTV;
  const orientation: Orientation = width >= height ? 'landscape' : 'portrait';

  // Shortest side, not current width: a tablet stays a tablet when you turn it,
  // whereas "is the width over 600" would reclassify a phone held sideways.
  const shortestSide = Math.min(width, height);
  const device: DeviceClass = isTV
    ? 'tv'
    : shortestSide >= TABLET_MIN_SHORTEST_SIDE
    ? 'tablet'
    : 'phone';

  const key = layoutKey(device, orientation);
  const gutter = GUTTER[key];
  const contentWidth = Math.max(0, width - gutter.horizontal * 2);

  return {
    device,
    orientation,
    isTV,
    isTouch: !isTV,
    width,
    height,
    gutter,
    contentWidth,
    typography: scaleTypography(HEADLINE_SCALE[device]),
    cardSize: resolveCardSizes(key, contentWidth),
    // A big jump on a 55-inch panel is unpleasant, and anything above ~1.1 makes
    // neighbouring cards visibly shift.
    focusScale: isTV ? 1.07 : 1,
    pressScale: isTV ? 1 : 0.96,
    gridColumns: GRID_COLUMNS[key],
    navPlacement: resolveNavPlacement(isTV, orientation),
    usesSidebar: isTV || contentWidth >= SIDEBAR_MIN_CONTENT_WIDTH,
    sidebarWidth: SIDEBAR_WIDTH[device],
    minTouchTarget: isTV ? 0 : 48,
  };
}
