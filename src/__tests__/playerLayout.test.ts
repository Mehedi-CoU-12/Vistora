import { resolveMetrics, type Metrics } from '../theme';
import {
  resolveOverlayEdges,
  resolvePlayerChrome,
} from '../player/playerLayout';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const tvMetrics: Metrics = {
  ...resolveMetrics(960, 540),
  device: 'tv',
  isTV: true,
  isTouch: false,
  gutter: { horizontal: 48, vertical: 27 },
  minTouchTarget: 0,
};

describe('resolvePlayerChrome', () => {
  it('prints key hints on a TV and not on a phone', () => {
    expect(resolvePlayerChrome(tvMetrics).showsKeyHints).toBe(true);
    expect(resolvePlayerChrome(resolveMetrics(390, 844)).showsKeyHints).toBe(
      false,
    );
  });

  it('makes the play button the biggest control in the transport row', () => {
    for (const chrome of [
      resolvePlayerChrome(tvMetrics),
      resolvePlayerChrome(resolveMetrics(844, 390)),
      resolvePlayerChrome(resolveMetrics(390, 844)),
    ]) {
      expect(chrome.playButton).toBeGreaterThan(chrome.skipButton);
      expect(chrome.playButton).toBeGreaterThan(chrome.iconButton);
    }
  });

  it('sizes an icon button no smaller than a labelled one', () => {
    for (const chrome of [
      resolvePlayerChrome(tvMetrics),
      resolvePlayerChrome(resolveMetrics(390, 844)),
    ]) {
      expect(chrome.iconButton).toBeGreaterThanOrEqual(chrome.buttonHeight);
      expect(chrome.iconGlyph).toBeLessThan(chrome.iconButton);
    }
  });

  it('drops the option shortcuts only on a narrow screen', () => {
    expect(
      resolvePlayerChrome(resolveMetrics(390, 844)).showsOptionShortcuts,
    ).toBe(false);
    expect(
      resolvePlayerChrome(resolveMetrics(844, 390)).showsOptionShortcuts,
    ).toBe(true);
    expect(resolvePlayerChrome(tvMetrics).showsOptionShortcuts).toBe(true);
  });

  it('never sizes a touch control below the minimum touch target', () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [800, 1280],
    ]) {
      const metrics = resolveMetrics(width, height);
      const chrome = resolvePlayerChrome(metrics);

      for (const size of [
        chrome.buttonHeight,
        chrome.seekRowHeight,
        chrome.playButton,
        chrome.skipButton,
        chrome.iconButton,
      ]) {
        expect(size).toBeGreaterThanOrEqual(metrics.minTouchTarget);
      }
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

  it('floats the transport in the middle of the picture on touch only', () => {
    expect(resolvePlayerChrome(tvMetrics).transportPlacement).toBe('bottom');

    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [800, 1280],
    ]) {
      expect(
        resolvePlayerChrome(resolveMetrics(width, height)).transportPlacement,
      ).toBe('centre');
    }
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
  it('uses the overscan allowance on a TV', () => {
    expect(resolveOverlayEdges(tvMetrics, noInsets)).toEqual({
      top: 27,
      right: 48,
      bottom: 27,
      left: 48,
    });
  });

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
