import type { Metrics } from '../theme';
import { spacing } from '../theme';

export interface PlayerChrome {
  showsKeyHints: boolean;
  compact: boolean;
  showsOptionShortcuts: boolean;
  transportPlacement: 'bottom' | 'centre';
  showsScrims: boolean;

  buttonHeight: number;
  buttonPaddingH: number;

  glyphSize: number;
  iconButton: number;
  iconGlyph: number;
  titleBlock: number;
  playButton: number;
  playGlyph: number;

  skipButton: number;
  skipGlyph: number;

  seekTrack: number;
  seekTrackActive: number;
  seekThumb: number;

  seekRowHeight: number;

  panelMode: 'side' | 'sheet';
  panelWidth: number;

  hudWidth: number;
  gap: number;
}

export const TITLE_GAP = 2;
export const TITLE_OFFSET = 2;

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
      transportPlacement: 'bottom',
      showsScrims: true,
      buttonHeight: 40,
      buttonPaddingH: spacing.lg,
      glyphSize: 15,

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
    transportPlacement: 'centre',
    showsScrims: false,
    buttonHeight: metrics.minTouchTarget,
    buttonPaddingH: compact ? spacing.md : spacing.lg,
    glyphSize: 14,
    iconButton: metrics.minTouchTarget,
    iconGlyph: tablet ? 22 : 20,
    titleBlock,

    playButton: tablet ? 68 : 60,
    playGlyph: tablet ? 28 : 25,
    skipButton: metrics.minTouchTarget,
    skipGlyph: tablet ? 22 : 20,
    seekTrack: 4,
    seekTrackActive: 7,
    seekThumb: 16,

    seekRowHeight: metrics.minTouchTarget,
    panelMode: compact ? 'sheet' : 'side',
    panelWidth: tablet ? 380 : 320,
    hudWidth: compact ? 168 : 200,
    gap: compact ? spacing.sm : spacing.md,
  };
}

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

const SCRIM_RAMP = spacing.xxl;

const HINT_LINE = spacing.lg;

export interface ScrimEdge {
  height: number;
  hold: number;
}

export interface ScrimHeights {
  top: ScrimEdge;
  bottom: ScrimEdge;
}

export function resolveScrimHeights(
  chrome: PlayerChrome,
  edges: EdgeInsets,
  { locked = false }: { locked?: boolean } = {},
): ScrimHeights {
  if (!chrome.showsScrims) {
    return { top: { height: 0, hold: 0 }, bottom: { height: 0, hold: 0 } };
  }

  const topContent = edges.top + Math.max(chrome.iconButton, chrome.titleBlock);

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

function withRamp(content: number): ScrimEdge {
  const height = content + SCRIM_RAMP;

  return { height, hold: content / height };
}
