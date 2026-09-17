import type { PlayableProtocol } from '../types/content';

export const SEEK_CHAIN_MS = 700;

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export const HOLD_TO_SPEED_RATE = 2;

export const SKIP_STEPS = [5, 10, 15, 30, 60] as const;

export type SkipStep = (typeof SKIP_STEPS)[number];

export const DEFAULT_SKIP_STEP: SkipStep = 10;

export const SEEK_STEP_SECONDS = DEFAULT_SKIP_STEP;

export type SeekGestureSpeed = 'precise' | 'normal' | 'fast' | 'turbo';

export const SEEK_GESTURE_SPEEDS: readonly SeekGestureSpeed[] = [
  'precise',
  'normal',
  'fast',
  'turbo',
];

export const SEEK_GESTURE_LABEL: Record<SeekGestureSpeed, string> = {
  precise: 'Precise',
  normal: 'Normal',
  fast: 'Fast',
  turbo: 'Turbo',
};

export const SEEK_GESTURE_WINDOW_SECONDS: Record<SeekGestureSpeed, number> = {
  precise: 45,
  normal: 120,
  fast: 300,
  turbo: 900,
};

export const DEFAULT_SEEK_GESTURE_SPEED: SeekGestureSpeed = 'normal';

export type ScalingMode = 'fit' | 'fill' | 'stretch' | 'native';

export const SCALING_MODES: readonly ScalingMode[] = [
  'fit',
  'fill',
  'stretch',
  'native',
];

export const SCALING_LABEL: Record<ScalingMode, string> = {
  fit: 'Fit',
  fill: 'Fill',
  stretch: 'Stretch',
  native: 'Native',
};

export const SCALING_DESCRIPTION: Record<ScalingMode, string> = {
  fit: 'Whole picture, black bars where it does not match',
  fill: 'Fills the screen, trims the edges off',
  stretch: 'Every pixel kept, and distorted to fit',
  native: 'The picture at its own size, however it lands',
};

export function resizeModeFor(
  mode: ScalingMode,
): 'contain' | 'cover' | 'stretch' | 'none' {
  switch (mode) {
    case 'fill':
      return 'cover';
    case 'stretch':
      return 'stretch';
    case 'native':
      return 'none';
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

export interface LabelledValue<T> {
  value: T;
  label: string;
}

export const SUBTITLE_SIZES: readonly LabelledValue<number>[] = [
  { value: 14, label: 'S' },
  { value: 18, label: 'M' },
  { value: 22, label: 'L' },
  { value: 28, label: 'XL' },
  { value: 34, label: 'XXL' },
];

export const DEFAULT_SUBTITLE_SIZE = 18;

export const SUBTITLE_LIFTS: readonly LabelledValue<number>[] = [
  { value: 0, label: 'Bottom' },
  { value: 32, label: 'Low' },
  { value: 72, label: 'Middle' },
  { value: 120, label: 'High' },
];

export const DEFAULT_SUBTITLE_LIFT = 0;

export const SUBTITLE_OPACITIES: readonly LabelledValue<number>[] = [
  { value: 0.45, label: 'Faint' },
  { value: 0.7, label: 'Soft' },
  { value: 1, label: 'Full' },
];

export const DEFAULT_SUBTITLE_OPACITY = 1;

export const SLEEP_TIMER_MINUTES: readonly number[] = [0, 15, 30, 45, 60, 90];

export function sleepTimerLabel(minutes: number): string {
  if (minutes <= 0) {
    return 'Off';
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

export function formatSkipStep(seconds: number): string {
  return seconds % 60 === 0 && seconds >= 60
    ? `${seconds / 60}m`
    : `${seconds}s`;
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

export function formatCountdown(milliseconds: number): string {
  return String(Math.max(0, Math.ceil(milliseconds / 1000)));
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
  detail?: string;
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

interface RawVideoTrack {
  index: number;
  width?: number;
  height?: number;
  bitrate?: number;
}

export function describeVideoTracks(
  tracks: readonly RawVideoTrack[],
): TrackChoice[] {
  return [...tracks]
    .filter(track => (track.height ?? 0) > 0 || (track.bitrate ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0),
    )
    .map((track, position) => ({
      index: track.index,
      label: qualityLabel(track, position),
      detail: formatBitrate(track.bitrate),
    }));
}

function qualityLabel(track: RawVideoTrack, position: number): string {
  const height = track.height ?? 0;
  if (height > 0) {
    return `${Math.round(height)}p`;
  }
  return formatBitrate(track.bitrate) ?? `Track ${position + 1}`;
}

export function formatBitrate(bitrate: number | undefined): string | undefined {
  if (!bitrate || !Number.isFinite(bitrate) || bitrate <= 0) {
    return undefined;
  }
  return bitrate >= 1e6
    ? `${Number((bitrate / 1e6).toFixed(1))} Mbps`
    : `${Math.round(bitrate / 1e3)} kbps`;
}

export type TrackSelection = 'auto' | 'off' | number;

export const MEDIA3_EXTENSION: Record<PlayableProtocol, string | undefined> = {
  hls: 'm3u8',
  dash: 'mpd',
  mp4: 'mp4',
  other: undefined,
};
