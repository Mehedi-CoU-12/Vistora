import { cardChrome, spacing } from './layout';
import type { Metrics } from './metrics';













export const COLUMN_GAP = spacing.md;













export function gridPadding(m: Metrics): { left: number; right: number } {
  return m.usesSidebar
    ? { left: spacing.sm, right: m.gutter.horizontal }
    : { left: m.gutter.horizontal, right: m.gutter.horizontal };
}




















export function computeCardWidth(
  gridWidth: number,
  columns: number,
  padding: { left: number; right: number },
): number {
  const usable =
    gridWidth - padding.left - padding.right - COLUMN_GAP * (columns - 1);
  return Math.floor(usable / columns) - cardChrome;
}
