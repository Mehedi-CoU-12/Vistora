import {Platform} from 'react-native';

import {cardAspect, cardChrome} from '../theme/layout';
import {COLUMN_GAP, computeCardWidth, gridPadding} from '../theme/grid';
import {resolveMetrics, type Metrics} from '../theme/metrics';

/**
 * The grid arithmetic decides whether the last column fits on the screen.
 *
 * That is worth a test rather than a look, because getting it wrong fails in a
 * way that is invisible until someone uses a remote: a card clipped off the
 * right edge is still in the platform's focus tree, so the D-pad moves the
 * highlight onto it and the user's selection disappears off-screen with nothing
 * to show where it went. There is no visual hint on a phone either -- the row
 * just looks cropped.
 *
 * Every case below is checked for every card variant, because the column count
 * is now per-variant: a poster grid and a channel grid on the same screen are
 * different arithmetic, and only one of them was ever verified by hand.
 */
function withPlatform<T>(isTV: boolean, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(Platform, 'isTV');
  Object.defineProperty(Platform, 'isTV', {get: () => isTV, configurable: true});
  try {
    return run();
  } finally {
    if (original) {
      Object.defineProperty(Platform, 'isTV', original);
    }
  }
}

const VARIANTS = ['poster', 'landscape', 'square'] as const;

const LAYOUTS = [
  ['tv', true, 960, 540],
  ['phone portrait', false, 390, 844],
  ['phone landscape', false, 844, 390],
  ['tablet portrait', false, 768, 1024],
  ['tablet landscape', false, 1024, 768],
  // A 4:3 panel reporting an unusual width, and a narrow phone: the two sizes
  // most likely to break an arithmetic tuned on a 960dp reference.
  ['unusual TV width', true, 1280, 720],
  ['narrow phone', false, 320, 640],
] as const;

/**
 * Width the grid area actually gets. With a sidebar it is what remains beside
 * it; without one it is the whole window. `CatalogScreen` measures this rather
 * than computing it, so the test has to reproduce the same subtraction.
 */
function gridAreaWidth(m: Metrics): number {
  return m.usesSidebar ? m.width - m.sidebarWidth : m.width;
}

describe('catalog grid arithmetic', () => {
  describe.each(LAYOUTS)('%s', (_name, isTV, width, height) => {
    const metrics = () => withPlatform(isTV, () => resolveMetrics(width, height));

    it.each(VARIANTS)('fits %s columns inside the measured width', variant => {
      const m = metrics();
      const columns = m.gridColumns[variant];
      const padding = gridPadding(m);
      const available = gridAreaWidth(m);
      const cardWidth = computeCardWidth(available, columns, padding);

      // A card occupies its artwork width plus its own padding and focus ring.
      const occupied =
        padding.left +
        padding.right +
        COLUMN_GAP * (columns - 1) +
        columns * (cardWidth + cardChrome);

      expect(occupied).toBeLessThanOrEqual(available);
    });

    /**
     * One column narrower must NOT also fit, or the layout is leaving a
     * column's worth of width empty at the right edge.
     */
    it.each(VARIANTS)('does not waste a whole column of %s width', variant => {
      const m = metrics();
      const columns = m.gridColumns[variant];
      const padding = gridPadding(m);
      const available = gridAreaWidth(m);
      const cardWidth = computeCardWidth(available, columns, padding);

      const slack =
        available -
        (padding.left +
          padding.right +
          COLUMN_GAP * (columns - 1) +
          columns * (cardWidth + cardChrome));

      expect(slack).toBeLessThan(cardWidth + cardChrome + COLUMN_GAP);
    });

    /**
     * FlatList throws if `columnWrapperStyle` is set while `numColumns` is 1,
     * and `CatalogScreen` always sets it. Two is also the point below which a
     * grid stops being a grid.
     */
    it.each(VARIANTS)('keeps at least two %s columns', variant => {
      expect(metrics().gridColumns[variant]).toBeGreaterThanOrEqual(2);
    });

    it.each(VARIANTS)('gives %s cards a usable width', variant => {
      const m = metrics();
      const cardWidth = computeCardWidth(
        gridAreaWidth(m),
        m.gridColumns[variant],
        gridPadding(m),
      );

      // The row-height calculation in CatalogScreen multiplies this by the
      // aspect ratio, so a non-positive width would render zero-height rows the
      // D-pad could still enter.
      expect(cardWidth).toBeGreaterThan(0);
      expect(Math.floor(cardWidth * cardAspect[variant])).toBeGreaterThan(0);
    });
  });

  /**
   * Multi-window and free-form resizing can hand the app a sliver. The
   * arithmetic is allowed to give up there -- it may go non-positive -- but it
   * must not return something that renders as a broken grid, which is why
   * `CatalogScreen` guards on `cardWidth <= 0` rather than trusting a floor
   * here.
   */
  it('signals an unusable window rather than clamping to a wrong width', () => {
    const m = withPlatform(false, () => resolveMetrics(80, 200));
    const cardWidth = computeCardWidth(
      gridAreaWidth(m),
      m.gridColumns.poster,
      gridPadding(m),
    );

    expect(cardWidth).toBeLessThanOrEqual(0);
  });
});
