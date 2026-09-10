import type { Metrics } from '../theme';
import { spacing } from '../theme';

export interface PlayerChrome {
  /** The "OK to select - Back to exit" helper line. TV only. */
  showsKeyHints: boolean;
  /**
   * True on a narrow window (phone portrait, or a small split-screen pane).
   * Rows wrap and the settings panel becomes a bottom sheet instead of a side
   * panel.
   */
  compact: boolean;
  /**
   * Whether the top-right cluster carries the picture-size and pop-out
   * shortcuts, or leaves them to the settings panel.
   *
   * Both are *also* in the panel, which is what makes dropping them safe: on a
   * narrow screen the cluster is competing with the title for the same row, and
   * a back button plus four icons on a 390dp phone leaves the title about 90dp
   * to be truncated into. The two controls that lose are the two a viewer sets
   * once for a piece of content, so the cost of the extra press is paid rarely
   * and the title stays readable always.
   */
  showsOptionShortcuts: boolean;
  /** Minimum height of a control button, and the diameter of a round one. */
  buttonHeight: number;
  buttonPaddingH: number;
  /** Size of the icon drawn inside a labelled pill. */
  glyphSize: number;
  /**
   * The round icon-only buttons: back at the top left, and the option cluster at
   * the top right. `iconGlyph` is the icon drawn inside one.
   *
   * Larger than the icon it holds by a wide margin, because the whole control is
   * the target -- a 20dp icon in a 48dp button is a shape a finger can miss and
   * still hit.
   */
  iconButton: number;
  iconGlyph: number;
  /**
   * Height of the two-line title block beside the back button.
   *
   * Measured rather than assumed, because it is *taller* than the round buttons
   * next to it (a 32dp title line plus a 20dp subtitle line clears a 48dp
   * button) and it is therefore what sets the height of the top bar. Assuming
   * the button was the tallest thing there is what left the subtitle hanging
   * below the scrim, over bare picture -- see `resolveScrimHeights`.
   */
  titleBlock: number;
  /**
   * The round play/pause button in the middle of the transport row, and the
   * icon inside it.
   *
   * Bigger than the skip buttons flanking it, which is what makes the one
   * control reached for without looking findable without reading anything.
   */
  playButton: number;
  playGlyph: number;
  /** The skip-10s buttons either side of it, and their icons. */
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
 * Gap between the title and the subtitle, and the nudge that optically centres
 * the pair against the round button beside them (whose ink starts lower than a
 * cap height).
 *
 * Exported because `PlayerControls` draws them and `resolvePlayerChrome`
 * measures them, and a scrim sized from a different number than the one the
 * layout uses is a scrim that stops in the wrong place.
 */
export const TITLE_GAP = 2;
export const TITLE_OFFSET = 2;

/**
 * Window width, in dp, below which the overlay switches to its narrow form.
 *
 * Chosen from the two real cases rather than from a round number: a phone in
 * portrait is ~390dp and must be narrow; the same phone in landscape is ~840dp
 * and holds a title, a back button and the full option cluster on one row with
 * room to spare.
 */
const COMPACT_MAX_WIDTH = 560;

export function resolvePlayerChrome(metrics: Metrics): PlayerChrome {
  const compact = metrics.width < COMPACT_MAX_WIDTH;

  const titleBlock =
    TITLE_OFFSET +
    metrics.typography.title.lineHeight +
    TITLE_GAP +
    metrics.typography.body.lineHeight;

  if (metrics.isTV) {
    return {
      showsKeyHints: true,
      compact: false,
      showsOptionShortcuts: true,
      buttonHeight: 40,
      buttonPaddingH: spacing.lg,
      glyphSize: 15,
      // Chunkier than the equivalent phone control rather than smaller, which is
      // the mistake a "TVs are big so everything can be small" instinct leads
      // to: these are read at three metres, and 48dp is 108px on a 1080p panel.
      iconButton: 48,
      iconGlyph: 22,
      titleBlock,
      playButton: 64,
      playGlyph: 28,
      skipButton: 48,
      skipGlyph: 20,
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
    showsKeyHints: false,
    compact,
    showsOptionShortcuts: !compact,
    // `minTouchTarget` is 48 on touch devices: the smallest thing a finger hits
    // reliably. Buttons are not made smaller than it, ever -- a 32dp button in a
    // dark room while the video keeps playing is a mis-tap waiting to happen.
    buttonHeight: metrics.minTouchTarget,
    buttonPaddingH: compact ? spacing.md : spacing.lg,
    glyphSize: 14,
    iconButton: metrics.minTouchTarget,
    iconGlyph: tablet ? 22 : 20,
    titleBlock,
    // Bigger than the skip buttons beside it, because it is the one control
    // reached for without looking, but not so big that it crowds the row.
    playButton: tablet ? 68 : 60,
    playGlyph: tablet ? 28 : 25,
    skipButton: metrics.minTouchTarget,
    skipGlyph: tablet ? 22 : 20,
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

/**
 * The distance each scrim spends fading out, beyond the controls it darkens.
 *
 * Without it a scrim ends exactly where its last control does, and a gradient
 * that reaches zero at the same line the text ends on still has visible tone
 * there -- so the picture gets a soft horizontal band across it. Fading over a
 * further 48dp puts the point where the scrim becomes nothing somewhere the eye
 * has no edge to compare it against.
 */
const SCRIM_RAMP = spacing.xxl;

/** Room for the one line of key hints the TV prints under its buttons. */
const HINT_LINE = spacing.lg;

export interface ScrimEdge {
  height: number;
  /**
   * The fraction of `height`, measured from the screen edge inwards, over which
   * the gradient stays at full strength before it starts to fade.
   *
   * This is the number that makes the scrim work, and getting it wrong is
   * visible immediately on a bright frame. A gradient that begins fading at the
   * screen edge is already half gone by the time it reaches the bottom of the
   * controls, so a subtitle or a scrub bar ends up sitting on 20% black over a
   * white sky -- which is how the first version of this shipped and why the
   * subtitle was unreadable over a cloud. Holding full strength across the
   * controls and spending the whole ramp *past* them costs nothing: the held
   * region is exactly the strip that has chrome drawn on it anyway.
   */
  hold: number;
}

export interface ScrimHeights {
  top: ScrimEdge;
  bottom: ScrimEdge;
}

/**
 * The geometry of the two scrims behind the overlay.
 *
 * ---------------------------------------------------------------------------
 * Why two gradients rather than one flat wash
 * ---------------------------------------------------------------------------
 * The overlay used to sit on a single full-screen 55% black layer, and it made
 * the text legible by dimming the entire film -- including the middle of the
 * frame, where there is never a control and always the thing the viewer is
 * actually looking at. Every four seconds the whole picture got darker and then
 * lighter again.
 *
 * Controls only ever occupy the top and bottom strips, so that is where the
 * scrim belongs, and it fades to nothing before it reaches the middle. The
 * result is a picture that stays a picture while the controls are up, and text
 * that is *more* legible than before rather than less: each strip can be much
 * darker than 55% precisely because it is not covering anything worth seeing.
 *
 * ---------------------------------------------------------------------------
 * Why the heights are computed rather than a percentage of the screen
 * ---------------------------------------------------------------------------
 * A percentage is the tempting shortcut and it does not survive the aspect
 * ratios this app runs at. 40% of a phone in portrait is 340dp of gradient over
 * about 140dp of controls -- a third of the screen dimmed for nothing -- while
 * the same 40% of a phone in landscape barely clears the buttons. So each scrim
 * is measured from what it has to cover: the safe-area edge, the controls
 * themselves, and the ramp.
 */
export function resolveScrimHeights(
  chrome: PlayerChrome,
  edges: EdgeInsets,
  { locked = false }: { locked?: boolean } = {},
): ScrimHeights {
  // The top bar is one row, and the title block rather than the round buttons
  // is usually the tallest thing in it.
  const topContent = edges.top + Math.max(chrome.iconButton, chrome.titleBlock);

  // Locked, the overlay is one Unlock button and nothing else, so the strip
  // that has to stay legible is one button tall. Reusing the full height here
  // would dim a third of the picture to back a single pill -- and locked is the
  // state a viewer leaves the player in for an hour.
  const bottomContent = locked
    ? edges.bottom + chrome.buttonHeight
    : edges.bottom +
      chrome.seekRowHeight +
      chrome.gap +
      chrome.playButton +
      (chrome.showsKeyHints ? chrome.gap + HINT_LINE : 0);

  return {
    top: locked ? { height: 0, hold: 0 } : withRamp(topContent),
    bottom: withRamp(bottomContent),
  };
}

/**
 * Turns "this much content" into a scrim height and the hold fraction that goes
 * with it.
 *
 * The two are derived together on purpose -- `hold` is meaningless without the
 * height it is a fraction of, and computing them at separate call sites is how
 * they drift apart.
 */
function withRamp(content: number): ScrimEdge {
  const height = content + SCRIM_RAMP;

  return { height, hold: content / height };
}
