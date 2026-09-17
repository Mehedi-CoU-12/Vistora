import { resolveMetrics, type Metrics } from '../theme';
import {
  resolveOverlayEdges,
  resolvePlayerChrome,
  resolveScrimHeights,
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

  it('draws the scrims on a TV and not on a phone', () => {
    expect(resolvePlayerChrome(tvMetrics).showsScrims).toBe(true);

    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [800, 1280],
    ]) {
      expect(
        resolvePlayerChrome(resolveMetrics(width, height)).showsScrims,
      ).toBe(false);
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

describe('resolveScrimHeights', () => {
  it('covers the controls at each edge', () => {
    const chrome = resolvePlayerChrome(tvMetrics);
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const scrim = resolveScrimHeights(chrome, edges);

    expect(scrim.top.height).toBeGreaterThan(edges.top + chrome.iconButton);
    expect(scrim.bottom.height).toBeGreaterThan(
      edges.bottom + chrome.seekRowHeight + chrome.playButton,
    );
  });

  it('holds full strength across the whole title block, not just the buttons', () => {
    const chrome = resolvePlayerChrome(tvMetrics);
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const { top } = resolveScrimHeights(chrome, edges);

    expect(chrome.titleBlock).toBeGreaterThan(chrome.iconButton);
    expect(top.hold * top.height).toBeGreaterThanOrEqual(
      edges.top + chrome.titleBlock,
    );
  });

  it('leaves a ramp at both edges', () => {
    const scrim = resolveScrimHeights(
      resolvePlayerChrome(tvMetrics),
      resolveOverlayEdges(tvMetrics, noInsets),
    );

    for (const edge of [scrim.top, scrim.bottom]) {
      expect(edge.hold).toBeGreaterThan(0);
      expect(edge.hold).toBeLessThan(1);
    }
  });

  it('draws nothing where the chrome carries its own contrast', () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      const metrics = resolveMetrics(width, height);
      const scrim = resolveScrimHeights(
        resolvePlayerChrome(metrics),
        resolveOverlayEdges(metrics, {
          top: 36,
          right: 0,
          bottom: 24,
          left: 0,
        }),
      );

      expect(scrim.top.height).toBe(0);
      expect(scrim.bottom.height).toBe(0);
    }
  });

  it('makes the bottom taller than the top', () => {
    const scrim = resolveScrimHeights(
      resolvePlayerChrome(tvMetrics),
      resolveOverlayEdges(tvMetrics, noInsets),
    );

    expect(scrim.bottom.height).toBeGreaterThan(scrim.top.height);
  });

  it('grows with the safe-area insets', () => {
    const metrics = resolveMetrics(390, 844);
    const chrome = { ...resolvePlayerChrome(metrics), showsScrims: true };

    const bare = resolveScrimHeights(
      chrome,
      resolveOverlayEdges(metrics, noInsets),
    );
    const inset = resolveScrimHeights(
      chrome,
      resolveOverlayEdges(metrics, { ...noInsets, top: 36, bottom: 24 }),
    );

    expect(inset.top.height - bare.top.height).toBe(36);
    expect(inset.bottom.height - bare.bottom.height).toBe(24);
  });

  it('leaves room for the key hints a TV prints', () => {
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const tv = resolvePlayerChrome(tvMetrics);
    const withoutHints = resolveScrimHeights(
      { ...tv, showsKeyHints: false },
      edges,
    );

    expect(resolveScrimHeights(tv, edges).bottom.height).toBeGreaterThan(
      withoutHints.bottom.height,
    );
  });

  it('shrinks to a single button when locked', () => {
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const chrome = resolvePlayerChrome(tvMetrics);

    const locked = resolveScrimHeights(chrome, edges, { locked: true });
    const unlocked = resolveScrimHeights(chrome, edges);

    expect(locked.top.height).toBe(0);
    expect(locked.bottom.height).toBeLessThan(unlocked.bottom.height);
    expect(locked.bottom.height).toBeGreaterThan(
      edges.bottom + chrome.buttonHeight,
    );
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
