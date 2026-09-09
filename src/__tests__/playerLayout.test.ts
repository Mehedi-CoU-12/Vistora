import { resolveMetrics, type Metrics } from '../theme';
import {
  resolveOverlayEdges,
  resolvePlayerChrome,
} from '../player/playerLayout';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * A TV `Metrics`, built by hand.
 *
 * `resolveMetrics` reads `Platform.isTV`, which is false under Jest, so the TV
 * branch cannot be reached through it. Since the chrome is a pure function of
 * the metrics it is given, handing it a TV-shaped object tests the same code
 * path the device takes.
 */
const tvMetrics: Metrics = {
  ...resolveMetrics(960, 540),
  device: 'tv',
  isTV: true,
  isTouch: false,
  gutter: { horizontal: 48, vertical: 27 },
  minTouchTarget: 0,
};

describe('resolvePlayerChrome', () => {
  it('gives a TV two focus rows and no centre cluster', () => {
    const chrome = resolvePlayerChrome(tvMetrics);

    // A remote cannot reach for the middle of the screen, and a second focus
    // target there would only compete with the button row for left/right.
    expect(chrome.showsCentreCluster).toBe(false);
    expect(chrome.showsKeyHints).toBe(true);
  });

  it('gives a phone the centre cluster and no key hints', () => {
    const chrome = resolvePlayerChrome(resolveMetrics(390, 844));

    expect(chrome.showsCentreCluster).toBe(true);
    expect(chrome.showsKeyHints).toBe(false);
  });

  // A control smaller than the platform minimum is a control that only works
  // for people who do not need it to.
  it('never sizes a touch control below the minimum touch target', () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [800, 1280],
    ]) {
      const metrics = resolveMetrics(width, height);
      const chrome = resolvePlayerChrome(metrics);

      expect(chrome.buttonHeight).toBeGreaterThanOrEqual(
        metrics.minTouchTarget,
      );
      expect(chrome.seekRowHeight).toBeGreaterThanOrEqual(
        metrics.minTouchTarget,
      );
      expect(chrome.skipButton).toBeGreaterThanOrEqual(metrics.minTouchTarget);
    }
  });

  it('turns the settings panel into a sheet only where a side panel will not fit', () => {
    expect(resolvePlayerChrome(resolveMetrics(390, 844)).panelMode).toBe(
      'sheet',
    );
    expect(resolvePlayerChrome(resolveMetrics(844, 390)).panelMode).toBe(
      'side',
    );
    expect(resolvePlayerChrome(tvMetrics).panelMode).toBe('side');
  });

  it('keeps a side panel narrower than the window it sits in', () => {
    for (const [width, height] of [
      [844, 390],
      [1280, 800],
      [960, 540],
    ]) {
      const chrome = resolvePlayerChrome(resolveMetrics(width, height));
      if (chrome.panelMode === 'side') {
        expect(chrome.panelWidth).toBeLessThan(width / 2);
      }
    }
  });
});

describe('resolveOverlayEdges', () => {
  // On a TV the platform reports no insets and the panel crops anyway, so the
  // overscan allowance is the whole of the padding.
  it('uses the overscan allowance on a TV', () => {
    expect(resolveOverlayEdges(tvMetrics, noInsets)).toEqual({
      top: 27,
      right: 48,
      bottom: 27,
      left: 48,
    });
  });

  // A cutout that was at the top in portrait is at the left in landscape, so the
  // insets have to be added per edge rather than as one number.
  it('adds the real insets per edge on a phone', () => {
    const metrics = resolveMetrics(844, 390);
    const edges = resolveOverlayEdges(metrics, {
      top: 0,
      right: 24,
      bottom: 16,
      left: 48,
    });

    expect(edges.left).toBe(metrics.gutter.horizontal + 48);
    expect(edges.right).toBe(metrics.gutter.horizontal + 24);
    expect(edges.top).toBe(metrics.gutter.vertical);
    expect(edges.bottom).toBe(metrics.gutter.vertical + 16);
  });
});
