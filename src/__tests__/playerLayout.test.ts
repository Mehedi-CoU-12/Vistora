import { resolveMetrics, type Metrics } from '../theme';
import {
  resolveOverlayEdges,
  resolvePlayerChrome,
  resolveScrimHeights,
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
  // Nothing on a remote is self-evident, so the TV prints its key hints; a
  // phone's gestures are the ones every video app already taught the user.
  it('prints key hints on a TV and not on a phone', () => {
    expect(resolvePlayerChrome(tvMetrics).showsKeyHints).toBe(true);
    expect(resolvePlayerChrome(resolveMetrics(390, 844)).showsKeyHints).toBe(
      false,
    );
  });

  // Play/pause is the one control reached for without looking, on a remote as
  // much as under a thumb, so it is the largest thing in the transport row on
  // both devices -- and the skips flanking it have to stay smaller, or the group
  // has no centre to aim at.
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

  // An icon-only control says less than a labelled one, so it cannot also be
  // the harder one to hit.
  it('sizes an icon button no smaller than a labelled one', () => {
    for (const chrome of [
      resolvePlayerChrome(tvMetrics),
      resolvePlayerChrome(resolveMetrics(390, 844)),
    ]) {
      expect(chrome.iconButton).toBeGreaterThanOrEqual(chrome.buttonHeight);
      expect(chrome.iconGlyph).toBeLessThan(chrome.iconButton);
    }
  });

  // The cluster competes with the title for one row, and 390dp does not hold
  // both. The two shortcuts that go are the two that are also in the panel.
  it('drops the option shortcuts only on a narrow screen', () => {
    expect(
      resolvePlayerChrome(resolveMetrics(390, 844)).showsOptionShortcuts,
    ).toBe(false);
    expect(
      resolvePlayerChrome(resolveMetrics(844, 390)).showsOptionShortcuts,
    ).toBe(true);
    expect(resolvePlayerChrome(tvMetrics).showsOptionShortcuts).toBe(true);
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

  // A thumb reaches the middle of a phone without the hand moving, and a bottom
  // strip carrying both the scrub bar and a 60dp play button is a third of a
  // handset in landscape. A D-pad cannot reach the middle of the picture at all
  // without taking left/right away from the bar, so a TV keeps the strip.
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

  // The scrims are sized from the controls they back, and on a handset the pair
  // came to about 310dp of a 390dp landscape screen -- the two gradients met in
  // the middle and raising the controls drew a curtain over the film. A TV has
  // the height to spare and text that is read at three metres.
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
  // The whole point of two gradients rather than one wash is that the middle of
  // the picture stays undimmed, so each strip has to be big enough to cover its
  // own controls and no bigger.
  it('covers the controls at each edge', () => {
    const chrome = resolvePlayerChrome(tvMetrics);
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const scrim = resolveScrimHeights(chrome, edges);

    expect(scrim.top.height).toBeGreaterThan(edges.top + chrome.iconButton);
    expect(scrim.bottom.height).toBeGreaterThan(
      edges.bottom + chrome.seekRowHeight + chrome.playButton,
    );
  });

  /**
   * The regression this pins is the one that was visible on a bright frame: the
   * subtitle sat *below* the held region, on about 20% black over a white sky,
   * because the top scrim was sized against the round back button while the
   * two-line title block beside it is taller.
   */
  it('holds full strength across the whole title block, not just the buttons', () => {
    const chrome = resolvePlayerChrome(tvMetrics);
    const edges = resolveOverlayEdges(tvMetrics, noInsets);
    const { top } = resolveScrimHeights(chrome, edges);

    expect(chrome.titleBlock).toBeGreaterThan(chrome.iconButton);
    expect(top.hold * top.height).toBeGreaterThanOrEqual(
      edges.top + chrome.titleBlock,
    );
  });

  // Everything past the held region is ramp, and it is the same distance on
  // every device -- so the fraction is whatever is left over, never 0 or 1.
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

  /**
   * The complaint this pins: on a phone the two gradients were tall enough to
   * meet, so tapping the screen to raise the controls blacked out the film
   * instead of backing the chrome drawn on it. Where the chrome backs itself --
   * translucent pills, discs and a text shadow -- there is no scrim at all,
   * rather than a shorter one that would still be a band across the picture.
   */
  it('draws nothing where the chrome carries its own contrast', () => {
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      const metrics = resolveMetrics(width, height);
      const scrim = resolveScrimHeights(
        resolvePlayerChrome(metrics),
        resolveOverlayEdges(metrics, { top: 36, right: 0, bottom: 24, left: 0 }),
      );

      expect(scrim.top.height).toBe(0);
      expect(scrim.bottom.height).toBe(0);
    }
  });

  // The bottom carries the bar, the readouts and the transport row; the top
  // carries one row. A symmetrical pair of scrims would either fail to cover the
  // bottom or dim twice as much of the picture as the top needs.
  it('makes the bottom taller than the top', () => {
    const scrim = resolveScrimHeights(
      resolvePlayerChrome(tvMetrics),
      resolveOverlayEdges(tvMetrics, noInsets),
    );

    expect(scrim.bottom.height).toBeGreaterThan(scrim.top.height);
  });

  // The controls are pushed inwards by a cutout or a system bar, so the gradient
  // behind them has to grow by the same amount or its ramp ends up underneath
  // them.
  it('grows with the safe-area insets', () => {
    // A phone's chrome with the scrims switched on, because the insets are the
    // thing under test and a real TV reports none: the platform gives a TV zeros
    // and the overscan allowance takes their place.
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

  // A TV prints a line of key hints under its buttons, and a scrim that stops
  // above it leaves the one piece of text nobody can guess at sitting on bare
  // video.
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

  // Locked, the overlay is a single Unlock button: there is no top bar to back,
  // and backing one button with the full-height bottom scrim would dim a third
  // of a film someone has deliberately locked and walked away from.
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
