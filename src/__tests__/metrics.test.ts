import {Platform} from 'react-native';

import {cardAspect} from '../theme/layout';
import {resolveMetrics} from '../theme/metrics';

/**
 * `resolveMetrics` is a pure function of the window size, which is exactly why
 * it is worth testing: it is the one place the app decides what kind of screen
 * it is on, and every card size, column count and type size follows from it.
 * Checking it here means a layout regression shows up as a failing assertion
 * rather than as a clipped column on somebody's television.
 *
 * `Platform.isTV` is a getter backed by a native constant, so it is stubbed
 * rather than mocked at the module level.
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

/** The logical viewport every Android TV presents, 1080p and 4K alike. */
const TV = {width: 960, height: 540};
const PHONE_PORTRAIT = {width: 390, height: 844};
const PHONE_LANDSCAPE = {width: 844, height: 390};
const TABLET_PORTRAIT = {width: 768, height: 1024};
const TABLET_LANDSCAPE = {width: 1024, height: 768};

describe('resolveMetrics on TV', () => {
  const tv = () => withPlatform(true, () => resolveMetrics(TV.width, TV.height));

  it('classifies the device from Platform.isTV, not from the window size', () => {
    const m = tv();
    expect(m.device).toBe('tv');
    expect(m.isTV).toBe(true);
    expect(m.isTouch).toBe(false);
  });

  /**
   * These are the numbers checked on a real Android TV, with the row density and
   * focus ring they were tuned for. They are pinned deliberately: making the TV
   * card sizes fluid would put verified behaviour behind an arithmetic that a
   * panel reporting 906dp or 1280dp could quietly change.
   */
  it('keeps the verified TV card sizes exactly', () => {
    const {cardSize} = tv();
    expect(cardSize.poster).toEqual({width: 124, height: 186});
    expect(cardSize.landscape).toEqual({width: 168, height: 94});
    expect(cardSize.square).toEqual({width: 116, height: 116});
  });

  it('keeps the 5% overscan allowance and the four-column grid', () => {
    const m = tv();
    expect(m.gutter).toEqual({horizontal: 48, vertical: 27});
    expect(m.contentWidth).toBe(864);
    expect(m.gridColumns).toBe(4);
    expect(m.usesSidebar).toBe(true);
  });

  it('uses the unscaled reference type scale and the D-pad focus treatment', () => {
    const m = tv();
    expect(m.typography.display.fontSize).toBe(34);
    expect(m.typography.body.fontSize).toBe(15);
    expect(m.focusScale).toBeGreaterThan(1);
    // A remote lands on a small target accurately, so nothing is padded for a
    // fingertip.
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
    // 48dp a side is 5% of a TV and a quarter of a 390dp phone, which crops
    // nothing.
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

    // 34dp is 3.5% of a TV's width and 8.7% of this phone's.
    expect(m.typography.display.fontSize).toBeLessThan(tv.typography.display.fontSize);
    expect(m.typography.title.fontSize).toBeLessThan(tv.typography.title.fontSize);
    // Body is legible at both viewing distances, so it does not move.
    expect(m.typography.body.fontSize).toBe(tv.typography.body.fontSize);
    expect(m.typography.caption.fontSize).toBe(tv.typography.caption.fontSize);
  });

  it('swaps the category sidebar for a chip rail only when width runs out', () => {
    // Portrait has 358dp of content: a 176dp sidebar would be half the screen.
    expect(portrait().usesSidebar).toBe(false);
    // Landscape has 796dp, and there a sidebar is the better trade -- it costs
    // no vertical space, which is what this window is short of.
    expect(landscape().usesSidebar).toBe(true);
  });

  it('gives the grid fewer columns than a TV, and more when turned sideways', () => {
    expect(portrait().gridColumns).toBe(2);
    expect(landscape().gridColumns).toBe(3);
  });

  it('sizes row cards fluidly, leaving part of one visible as a scroll cue', () => {
    const {cardSize, contentWidth} = portrait();
    // A whole number of cards across would end the row flush with the screen
    // edge and look complete when it is not.
    expect(contentWidth / cardSize.poster.width).not.toBeCloseTo(
      Math.round(contentWidth / cardSize.poster.width),
      1,
    );
    // And they must still fit: two posters plus their chrome inside the width.
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
      const {cardSize} = withPlatform(isTV, () =>
        resolveMetrics(size.width, size.height),
      );

      for (const variant of ['poster', 'landscape', 'square'] as const) {
        const {width, height} = cardSize[variant];
        expect(height).toBe(Math.floor(width * cardAspect[variant]));
      }
    },
  );

  it.each(cases)(
    'never produces a card wider than the content (%s)',
    (_name, isTV, size) => {
      const m = withPlatform(isTV, () => resolveMetrics(size.width, size.height));

      for (const variant of ['poster', 'landscape', 'square'] as const) {
        expect(m.cardSize[variant].width).toBeGreaterThan(0);
        expect(m.cardSize[variant].width).toBeLessThan(m.contentWidth);
      }
    },
  );

  /**
   * Shortest side, not current width. "Is the width over 600" would reclassify a
   * phone the moment it was held sideways, changing the type scale and the card
   * sizes mid-rotation.
   */
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
    // Multi-window and free-form resizing can hand the app a sliver. It must not
    // produce a negative or zero card width.
    const m = withPlatform(false, () => resolveMetrics(120, 200));
    expect(m.cardSize.poster.width).toBeGreaterThan(0);
    expect(m.gridColumns).toBeGreaterThanOrEqual(2);
  });
});
