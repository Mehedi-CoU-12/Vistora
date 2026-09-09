import type { Metrics } from '../theme';
import { spacing } from '../theme';

/**
 * ===========================================================================
 * How big the player's own furniture is, per device.
 * ===========================================================================
 * `src/theme/metrics.ts` answers "what kind of screen is this" for the whole
 * app. This file answers the follow-up the player alone has to ask: how large is
 * a control that a *thumb* must hit versus one a *D-pad* merely has to land on,
 * and which pieces of the overlay exist at all.
 *
 * The two are genuinely different interfaces, not one interface with different
 * padding:
 *
 *   TV     A single focusable row of buttons plus a focusable scrub bar. No
 *          centre cluster -- a remote cannot "reach for the middle of the
 *          screen", and a second focus target there would only be somewhere for
 *          focus to get lost. Key hints are printed, because nothing on a remote
 *          is self-evident.
 *
 *   Touch  A big centre play/skip cluster, because that is where a thumb already
 *          is, plus the gesture layer (double-tap, swipe, pinch) that carries
 *          most of the interaction. No key hints: the gestures are the same ones
 *          every video app on the phone already taught the user.
 *
 * Everything is a pure function of `Metrics`, so it is safe to call inside a
 * `makeStyles` factory -- which is where most of it is called.
 */

export interface PlayerChrome {
  /** Big play/skip buttons in the middle of the screen. Touch only. */
  showsCentreCluster: boolean;
  /** The "OK to select - Back to exit" helper line. TV only. */
  showsKeyHints: boolean;
  /**
   * True on a narrow window (phone portrait, or a small split-screen pane).
   * Rows wrap, secondary buttons lose their text labels, and the settings panel
   * becomes a bottom sheet instead of a side panel.
   */
  compact: boolean;
  /** Minimum height of a control button, and the diameter of a round one. */
  buttonHeight: number;
  buttonPaddingH: number;
  /** Font size of the glyph inside a button. */
  glyphSize: number;
  /** The centre play/pause button, and the two skip buttons flanking it. */
  centreButton: number;
  centreGlyph: number;
  skipButton: number;
  skipGlyph: number;
  /** Scrub bar: thickness at rest, thickness while focused or dragging. */
  seekTrack: number;
  seekTrackActive: number;
  seekThumb: number;
  /** Height of the row the bar lives in -- the actual touch target. */
  seekRowHeight: number;
  /** Settings surface: a panel down the side, or a sheet up from the bottom. */
  panelMode: 'side' | 'sheet';
  panelWidth: number;
  /** Width of the volume / brightness / speed readout. */
  hudWidth: number;
  gap: number;
}

/**
 * Window width, in dp, below which the overlay switches to its narrow form.
 *
 * Chosen from the two real cases rather than from a round number: a phone in
 * portrait is ~390dp and must be narrow; the same phone in landscape is ~840dp
 * and comfortably fits a single row of labelled buttons.
 */
const COMPACT_MAX_WIDTH = 560;

export function resolvePlayerChrome(metrics: Metrics): PlayerChrome {
  const compact = metrics.width < COMPACT_MAX_WIDTH;

  if (metrics.isTV) {
    return {
      showsCentreCluster: false,
      showsKeyHints: true,
      compact: false,
      buttonHeight: 40,
      buttonPaddingH: spacing.lg,
      glyphSize: 15,
      // Unused on TV, but the type is one shape everywhere: a component reading
      // `centreButton` while `showsCentreCluster` is false is a bug in the
      // component, not something to make the type express.
      centreButton: 0,
      centreGlyph: 0,
      skipButton: 0,
      skipGlyph: 0,
      seekTrack: 4,
      seekTrackActive: 8,
      seekThumb: 16,
      seekRowHeight: 28,
      panelMode: 'side',
      panelWidth: 340,
      hudWidth: 240,
      gap: spacing.md,
    };
  }

  const tablet = metrics.device === 'tablet';

  return {
    showsCentreCluster: true,
    showsKeyHints: false,
    compact,
    // `minTouchTarget` is 48 on touch devices: the smallest thing a finger hits
    // reliably. Buttons are not made smaller than it, ever -- a 32dp button in a
    // dark room while the video keeps playing is a mis-tap waiting to happen.
    buttonHeight: metrics.minTouchTarget,
    buttonPaddingH: compact ? spacing.md : spacing.lg,
    glyphSize: 14,
    centreButton: tablet ? 84 : 68,
    centreGlyph: tablet ? 30 : 24,
    skipButton: tablet ? 64 : 52,
    skipGlyph: tablet ? 20 : 16,
    seekTrack: 4,
    seekTrackActive: 7,
    seekThumb: 16,
    // Taller than it looks: the bar itself is 4dp, but the row it sits in is the
    // draggable surface, and 4dp of drag target would be unusable.
    seekRowHeight: metrics.minTouchTarget,
    panelMode: compact ? 'sheet' : 'side',
    panelWidth: tablet ? 380 : 320,
    hudWidth: compact ? 168 : 200,
    gap: compact ? spacing.sm : spacing.md,
  };
}

/**
 * Padding that keeps the overlay clear of the edges of the screen.
 *
 * Two unrelated hazards, and each device has exactly one of them:
 *
 *   TV     Overscan. Many panels crop a few percent off every edge and cannot be
 *          told not to, and the platform never reports it -- safe-area insets are
 *          zero on a TV. So the allowance is a design constant, and it comes
 *          from `metrics.gutter`.
 *
 *   Phone  System bars and the display cutout. These the platform *does* report,
 *          through `useSafeAreaInsets()`, and they move when the phone rotates:
 *          the notch that was at the top is at the left in landscape. So the
 *          real insets are added to a small margin.
 *
 * They are added rather than maxed because they are different measurements of
 * different things; on the device that has one, the other is zero.
 */
export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function resolveOverlayEdges(
  metrics: Metrics,
  insets: EdgeInsets,
): EdgeInsets {
  const { horizontal, vertical } = metrics.gutter;

  return {
    top: vertical + insets.top,
    right: horizontal + insets.right,
    bottom: vertical + insets.bottom,
    left: horizontal + insets.left,
  };
}
