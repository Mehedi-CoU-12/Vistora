import { cardChrome, spacing } from './layout';
import type { Metrics } from './metrics';

/**
 * The arithmetic that divides a measured width into grid columns.
 *
 * Extracted from the screen that renders the grid for one reason: it is the
 * calculation that decides whether the last column fits on the screen, and a
 * clipped column on a TV is worse than an ugly one -- the D-pad will still move
 * focus onto it, so the user's selection vanishes off the right edge with no way
 * to see what is highlighted. Living here, it can be checked against every
 * layout and every card variant in a unit test rather than on a television.
 */

/** Gap between columns. The rhythm is device-independent; see `layout.ts`. */
export const COLUMN_GAP = spacing.md;

/**
 * Horizontal padding inside a catalog grid.
 *
 * With a sidebar, the sidebar's own right padding already separates the two
 * halves, so the grid needs only enough on the left to clear a card's padding.
 * Without one, the grid is the full width of the screen and takes the gutter on
 * both sides like everything else.
 *
 * `computeCardWidth` MUST be handed this same object, which is why both the
 * style that renders the padding and the width calculation that subtracts it
 * read from here rather than from a pair of constants that can drift apart.
 */
export function gridPadding(m: Metrics): { left: number; right: number } {
  return m.usesSidebar
    ? { left: spacing.sm, right: m.gutter.horizontal }
    : { left: m.gutter.horizontal, right: m.gutter.horizontal };
}

/**
 * Divides a measured grid width into exactly `columns` cards.
 *
 * The cards are FLUID rather than a fixed size, which matters more than it
 * sounds. With a fixed card width, whether the last column fits depends on the
 * screen width, the sidebar width and the padding all agreeing -- and when they
 * do not, the final column is clipped off the right edge.
 *
 * Computing the width instead means the row always fills the space exactly, on
 * any panel and at any window size -- which is load-bearing for two further
 * reasons: a phone rotated from portrait to landscape changes both the width and
 * the column count in the same frame, and the column count now varies by card
 * variant, so the same screen produces a different width for a poster than for a
 * channel tile.
 *
 * May return zero or less for a window too narrow to lay out at all (a
 * free-form multi-window sliver). Callers must not render a grid at that width;
 * see the `cardWidth <= 0` guard in `CatalogScreen`.
 */
export function computeCardWidth(
  gridWidth: number,
  columns: number,
  padding: { left: number; right: number },
): number {
  const usable =
    gridWidth - padding.left - padding.right - COLUMN_GAP * (columns - 1);
  return Math.floor(usable / columns) - cardChrome;
}
