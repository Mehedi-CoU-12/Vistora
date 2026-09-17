import { Platform } from 'react-native';

import { cardAspect } from '../theme/layout';
import { resolveMetrics } from '../theme/metrics';

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

const TV = { width: 960, height: 540 };
const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };
const TABLET_PORTRAIT = { width: 768, height: 1024 };
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

describe('resolveMetrics on TV', () => {
  const tv = () =>
    withPlatform(true, () => resolveMetrics(TV.width, TV.height));

  it('classifies the device from Platform.isTV, not from the window size', () => {
    const m = tv();
    expect(m.device).toBe('tv');
    expect(m.isTV).toBe(true);
    expect(m.isTouch).toBe(false);
  });

  it('keeps the verified TV card sizes exactly', () => {
    const { cardSize } = tv();
    expect(cardSize.poster).toEqual({ width: 124, height: 186 });
    expect(cardSize.landscape).toEqual({ width: 168, height: 94 });
    expect(cardSize.square).toEqual({ width: 116, height: 116 });
  });

  it('keeps the 5% overscan allowance and the four-column channel grid', () => {
    const m = tv();
    expect(m.gutter).toEqual({ horizontal: 48, vertical: 27 });
    expect(m.contentWidth).toBe(864);
    expect(m.gridColumns.landscape).toBe(4);
    expect(m.usesSidebar).toBe(true);
  });

  it('puts the tab bar at the top', () => {
    expect(tv().navPlacement).toBe('top');
  });

  it('uses the unscaled reference type scale and the D-pad focus treatment', () => {
    const m = tv();
    expect(m.typography.display.fontSize).toBe(34);
    expect(m.typography.body.fontSize).toBe(15);
    expect(m.focusScale).toBeGreaterThan(1);

    expect(m.minTouchTarget).toBe(0);
  });
});

describe('resolveMetrics on a phone', () => {
  const portrait = () =>
    withPlatform(false, () =>
      resolveMetrics(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height),
    );
  const landscape = () =>
    withPlatform(false, () =>
      resolveMetrics(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height),
    );

  it('reports a touch device in both orientations', () => {
    expect(portrait().device).toBe('phone');
    expect(landscape().device).toBe('phone');
    expect(portrait().orientation).toBe('portrait');
    expect(landscape().orientation).toBe('landscape');
    expect(portrait().isTouch).toBe(true);
  });

  it('drops the overscan allowance a phone does not need', () => {
    expect(portrait().gutter.horizontal).toBeLessThan(24);
  });

  it('pads controls for a fingertip and drops the focus scale', () => {
    const m = portrait();
    expect(m.minTouchTarget).toBeGreaterThanOrEqual(44);
    expect(m.focusScale).toBe(1);
    expect(m.pressScale).toBeLessThan(1);
  });

  it('scales the headlines down but leaves body text alone', () => {
    const m = portrait();
    const tv = withPlatform(true, () => resolveMetrics(TV.width, TV.height));

    expect(m.typography.display.fontSize).toBeLessThan(
      tv.typography.display.fontSize,
    );
    expect(m.typography.title.fontSize).toBeLessThan(
      tv.typography.title.fontSize,
    );

    expect(m.typography.body.fontSize).toBe(tv.typography.body.fontSize);
    expect(m.typography.caption.fontSize).toBe(tv.typography.caption.fontSize);
  });

  it('swaps the category sidebar for a chip rail only when width runs out', () => {
    expect(portrait().usesSidebar).toBe(false);

    expect(landscape().usesSidebar).toBe(true);
  });

  it('gives the channel grid fewer columns than a TV', () => {
    const tv = withPlatform(true, () => resolveMetrics(TV.width, TV.height));
    expect(portrait().gridColumns.landscape).toBeLessThan(
      tv.gridColumns.landscape,
    );
    expect(portrait().gridColumns.landscape).toBe(2);
  });

  it('fits more posters across than channel tiles', () => {
    expect(portrait().gridColumns.poster).toBeGreaterThan(
      portrait().gridColumns.landscape,
    );
  });

  it('takes more columns in landscape, where height is the scarce resource', () => {
    expect(landscape().gridColumns.poster).toBeGreaterThan(
      portrait().gridColumns.poster,
    );
  });

  it('moves the tab bar to the bottom only in portrait', () => {
    expect(portrait().navPlacement).toBe('bottom');
    expect(landscape().navPlacement).toBe('top');
  });

  it('sizes row cards fluidly, leaving part of one visible as a scroll cue', () => {
    const { cardSize, contentWidth } = portrait();

    expect(contentWidth / cardSize.poster.width).not.toBeCloseTo(
      Math.round(contentWidth / cardSize.poster.width),
      1,
    );

    expect(cardSize.poster.width * 2).toBeLessThan(contentWidth);
  });
});

describe('resolveMetrics invariants', () => {
  const cases = [
    ['tv', true, TV],
    ['phone portrait', false, PHONE_PORTRAIT],
    ['phone landscape', false, PHONE_LANDSCAPE],
    ['tablet portrait', false, TABLET_PORTRAIT],
    ['tablet landscape', false, TABLET_LANDSCAPE],
  ] as const;

  it.each(cases)(
    'keeps every card variant in its aspect ratio (%s)',
    (_name, isTV, size) => {
      const { cardSize } = withPlatform(isTV, () =>
        resolveMetrics(size.width, size.height),
      );

      for (const variant of VARIANTS) {
        const { width, height } = cardSize[variant];
        expect(height).toBe(Math.floor(width * cardAspect[variant]));
      }
    },
  );

  it.each(cases)(
    'never produces a card wider than the content (%s)',
    (_name, isTV, size) => {
      const m = withPlatform(isTV, () =>
        resolveMetrics(size.width, size.height),
      );

      for (const variant of VARIANTS) {
        expect(m.cardSize[variant].width).toBeGreaterThan(0);
        expect(m.cardSize[variant].width).toBeLessThan(m.contentWidth);
      }
    },
  );

  it('keeps a tablet a tablet through a rotation', () => {
    const p = withPlatform(false, () =>
      resolveMetrics(TABLET_PORTRAIT.width, TABLET_PORTRAIT.height),
    );
    const l = withPlatform(false, () =>
      resolveMetrics(TABLET_LANDSCAPE.width, TABLET_LANDSCAPE.height),
    );
    expect(p.device).toBe('tablet');
    expect(l.device).toBe('tablet');
    expect(p.typography.display.fontSize).toBe(l.typography.display.fontSize);
  });

  it('survives a window too small to lay anything out in', () => {
    const m = withPlatform(false, () => resolveMetrics(120, 200));
    expect(m.cardSize.poster.width).toBeGreaterThan(0);
    for (const variant of VARIANTS) {
      expect(m.gridColumns[variant]).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('hero metrics', () => {
  const VIEWPORTS = [
    ['tv', true, TV],
    ['phone portrait', false, PHONE_PORTRAIT],
    ['phone landscape', false, PHONE_LANDSCAPE],
    ['tablet portrait', false, TABLET_PORTRAIT],
    ['tablet landscape', false, TABLET_LANDSCAPE],
  ] as const;

  it.each(VIEWPORTS)(
    'gives %s a hero that fits on the screen',
    (_name, isTV, size) => {
      const m = withPlatform(isTV, () =>
        resolveMetrics(size.width, size.height),
      );

      expect(m.hero.height).toBeGreaterThan(0);
      expect(m.hero.height).toBeLessThanOrEqual(size.height);

      expect(m.hero.height).toBeLessThan(size.height * 0.9);
    },
  );

  it.each(VIEWPORTS)(
    'keeps %s copy inside the content width',
    (_name, isTV, size) => {
      const m = withPlatform(isTV, () =>
        resolveMetrics(size.width, size.height),
      );

      expect(m.hero.textMaxWidth).toBeGreaterThan(0);
      expect(m.hero.textMaxWidth).toBeLessThanOrEqual(m.contentWidth);
    },
  );

  it('puts the copy down one side wherever there is width for it', () => {
    const tv = withPlatform(true, () => resolveMetrics(TV.width, TV.height));
    const tablet = withPlatform(false, () =>
      resolveMetrics(TABLET_LANDSCAPE.width, TABLET_LANDSCAPE.height),
    );

    expect(tv.hero.align).toBe('start');
    expect(tablet.hero.align).toBe('start');
    expect(tv.hero.textMaxWidth).toBeLessThan(tv.contentWidth);
  });

  it('centres the copy on a phone held upright', () => {
    const m = withPlatform(false, () =>
      resolveMetrics(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height),
    );

    expect(m.hero.align).toBe('center');
  });

  it('drops the synopsis on a phone in landscape and nowhere else', () => {
    const landscape = withPlatform(false, () =>
      resolveMetrics(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height),
    );
    const portrait = withPlatform(false, () =>
      resolveMetrics(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height),
    );
    const tv = withPlatform(true, () => resolveMetrics(TV.width, TV.height));

    expect(landscape.hero.descriptionLines).toBe(0);
    expect(portrait.hero.descriptionLines).toBeGreaterThan(0);
    expect(tv.hero.descriptionLines).toBeGreaterThan(0);
  });

  it('clamps rather than degenerating in a sliver of a window', () => {
    const m = withPlatform(false, () => resolveMetrics(120, 200));

    expect(m.hero.height).toBeGreaterThanOrEqual(200);
    expect(m.hero.textMaxWidth).toBeGreaterThan(0);
  });

  it('does not let a very tall window produce an endless hero', () => {
    const m = withPlatform(false, () => resolveMetrics(800, 2400));

    expect(m.hero.height).toBeLessThanOrEqual(560);
  });
});
