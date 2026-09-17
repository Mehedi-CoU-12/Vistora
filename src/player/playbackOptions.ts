import type { PlayableProtocol } from '../types/content';

export const SEEK_STEP_SECONDS = 10;

export const SEEK_CHAIN_MS = 700;

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const HOLD_TO_SPEED_RATE = 2;

export type ScalingMode = 'fit' | 'fill' | 'stretch';

export const SCALING_MODES: readonly ScalingMode[] = ['fit', 'fill', 'stretch'];

export const SCALING_LABEL: Record<ScalingMode, string> = {
  fit: 'Fit',
  fill: 'Fill',
  stretch: 'Stretch',
};

export const SCALING_DESCRIPTION: Record<ScalingMode, string> = {
  fit: 'Whole frame, black bars if needed',
  fill: 'Fills the screen, crops the edges',
  stretch: 'Fills the screen, distorts the frame',
};

export function resizeModeFor(
  mode: ScalingMode,
): 'contain' | 'cover' | 'stretch' {
  switch (mode) {
    case 'fill':
      return 'cover';
    case 'stretch':
      return 'stretch';
    default:
      return 'contain';
  }
}

export function stepScalingMode(mode: ScalingMode, step: 1 | -1): ScalingMode {
  const count = SCALING_MODES.length;
  const index = SCALING_MODES.indexOf(mode);
  return SCALING_MODES[(index + step + count) % count];
}

export function nextScalingMode(mode: ScalingMode): ScalingMode {
  return stepScalingMode(mode, 1);
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

export function formatSeekDelta(seconds: number): string {
  const rounded = Math.round(seconds);
  const sign = rounded < 0 ? '-' : '+';
  const magnitude = Math.abs(rounded);

  if (magnitude < 60) {
    return `${sign}${magnitude}s`;
  }

  const minutes = Math.floor(magnitude / 60);
  const remainder = magnitude % 60;
  return `${sign}${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function clampSeekTarget(
  target: number,
  start: number,
  end: number,
): number {
  if (!Number.isFinite(end) || end <= start) {
    return start;
  }
  return clamp(target, start, Math.max(start, end - 0.25));
}

export function hasSeekLanded(
  reportedTime: number,
  pendingTarget: number,
  toleranceSeconds = 1,
): boolean {
  if (!Number.isFinite(reportedTime) || !Number.isFinite(pendingTarget)) {
    return true;
  }
  return Math.abs(reportedTime - pendingTarget) <= toleranceSeconds;
}

export function timeForTrackX(
  windowX: number,
  track: { pageX: number; width: number },
  timeline: { start: number; end: number },
): number | null {
  if (
    !Number.isFinite(windowX) ||
    !Number.isFinite(track.pageX) ||
    !(track.width > 0) ||
    !(timeline.end > timeline.start)
  ) {
    return null;
  }

  const fraction = (windowX - track.pageX) / track.width;

  return clampSeekTarget(
    timeline.start + fraction * (timeline.end - timeline.start),
    timeline.start,
    timeline.end,
  );
}

export interface TrackChoice {
  index: number;
  label: string;
}

interface RawTrack {
  index: number;
  title?: string;
  language?: string;
}

export function describeTracks(tracks: readonly RawTrack[]): TrackChoice[] {
  return tracks.map((track, position) => ({
    index: track.index,
    label: trackLabel(track, position),
  }));
}

function trackLabel(track: RawTrack, position: number): string {
  const title = track.title?.trim();
  if (title) {
    return title;
  }

  const language = track.language?.trim();
  if (language) {
    return language.toUpperCase();
  }

  return `Track ${position + 1}`;
}

export type TrackSelection = 'auto' | 'off' | number;

export const MEDIA3_EXTENSION: Record<PlayableProtocol, string | undefined> = {
  hls: 'm3u8',
  dash: 'mpd',
  mp4: 'mp4',
  other: undefined,
};
