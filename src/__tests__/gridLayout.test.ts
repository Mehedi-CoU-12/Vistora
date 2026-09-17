import { Platform } from 'react-native';

import { cardAspect, cardChrome } from '../theme/layout';
import { COLUMN_GAP, computeCardWidth, gridPadding } from '../theme/grid';
import { resolveMetrics, type Metrics } from '../theme/metrics';

function withPlatform<T>(isTV: boolean, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(Platform, 'isTV');
  Object.defineProperty(Platform, 'isTV', {
    get: () => isTV,
    configurable: true,
  });
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

  ['unusual TV width', true, 1280, 720],
  ['narrow phone', false, 320, 640],
] as const;

function gridAreaWidth(m: Metrics): number {
  return m.usesSidebar ? m.width - m.sidebarWidth : m.width;
}

describe('catalog grid arithmetic', () => {
  describe.each(LAYOUTS)('%s', (_name, isTV, width, height) => {
    const metrics = () =>
      withPlatform(isTV, () => resolveMetrics(width, height));

    it.each(VARIANTS)('fits %s columns inside the measured width', variant => {
      const m = metrics();
      const columns = m.gridColumns[variant];
      const padding = gridPadding(m);
      const available = gridAreaWidth(m);
      const cardWidth = computeCardWidth(available, columns, padding);

      const occupied =
        padding.left +
        padding.right +
        COLUMN_GAP * (columns - 1) +
        columns * (cardWidth + cardChrome);

      expect(occupied).toBeLessThanOrEqual(available);
    });

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

      expect(cardWidth).toBeGreaterThan(0);
      expect(Math.floor(cardWidth * cardAspect[variant])).toBeGreaterThan(0);
    });
  });

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
