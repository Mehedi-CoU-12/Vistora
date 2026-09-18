import type { Metrics } from '../theme';
import { spacing } from '../theme';

export interface PlayerChrome {
  showsKeyHints: boolean;
  compact: boolean;
  showsOptionShortcuts: boolean;
  transportPlacement: 'bottom' | 'centre';

  buttonHeight: number;
  buttonPaddingH: number;

  glyphSize: number;
  iconButton: number;
  iconGlyph: number;
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

  if (metrics.isTV) {
    return {
      showsKeyHints: true,
      compact: false,
      showsOptionShortcuts: true,
      transportPlacement: 'bottom',
      buttonHeight: 40,
      buttonPaddingH: spacing.lg,
      glyphSize: 15,

      iconButton: 48,
      iconGlyph: 22,
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
    buttonHeight: metrics.minTouchTarget,
    buttonPaddingH: compact ? spacing.md : spacing.lg,
    glyphSize: 14,
    iconButton: metrics.minTouchTarget,
    iconGlyph: tablet ? 22 : 20,
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
