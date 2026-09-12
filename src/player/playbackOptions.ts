import type { PlayableProtocol } from '../types/content';

/**
 * ===========================================================================
 * The player's vocabulary, as pure data and pure functions.
 * ===========================================================================
 * Everything here is a value or a total function: no React, no react-native, no
 * player instance. That is deliberate -- these are the rules a media player is
 * actually judged on (how far a skip goes, what "Fill" means, what a track is
 * called when the stream does not name it), and they are the parts worth having
 * unit tests for. The components import them; nothing here imports a component.
 */

/** One press of skip, one double-tap, or one D-pad nudge. */
export const SEEK_STEP_SECONDS = 10;

/**
 * How long a chain of accumulating seeks stays open.
 *
 * Skipping is deliberately NOT applied one press at a time. Each press adds to a
 * pending target and restarts this timer; the seek is issued once, when the user
 * stops. Two reasons, both of which you feel immediately on a real stream:
 *
 *   - A seek on an HLS source costs a segment fetch and a decoder flush. Six
 *     presses issued separately means six of those, and the picture stutters
 *     through five positions nobody asked to see.
 *   - The remote's key repeat fires at ~20/second when a key is held. Seeking
 *     per event would send the position flying.
 *
 * So holding RIGHT on a remote, or double-tapping repeatedly on a phone, builds
 * up "+40s" in the overlay and commits it once -- which is what every mature
 * player does, and why theirs feel instant.
 */
export const SEEK_CHAIN_MS = 700;

/** Speeds offered in the settings panel. 1 must be in the list. */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** Speed applied while a finger is held down on the video, VLC-style. */
export const HOLD_TO_SPEED_RATE = 2;

/**
 * How the picture is fitted to the window.
 *
 * The three modes people actually reach for, named as the user thinks of them
 * rather than as Media3 names them:
 *
 *   fit      the whole frame, letterboxed. Nothing cropped, nothing distorted.
 *   fill     fills the window by cropping the overhanging edges. What you want
 *            for 4:3 material on a 16:9 panel, or a 16:9 film on a 20:9 phone.
 *   stretch  fills the window by distorting the frame. Included because some
 *            broadcast feeds are anamorphic and genuinely need it -- but it is
 *            never a default, since it makes faces wrong.
 */
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

/** Our mode -> the `resizeMode` react-native-video understands. */
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

/**
 * Steps through the cycle, for the single-button and pinch paths.
 *
 * `step` is signed so a pinch can be reversible: spreading two fingers moves
 * towards filling the screen and pinching them back returns the way it came,
 * which is the only version of the gesture that feels like a control rather than
 * a button that happens to need two fingers.
 */
export function stepScalingMode(mode: ScalingMode, step: 1 | -1): ScalingMode {
  const count = SCALING_MODES.length;
  const index = SCALING_MODES.indexOf(mode);
  return SCALING_MODES[(index + step + count) % count];
}

/** Next mode in the cycle. */
export function nextScalingMode(mode: ScalingMode): ScalingMode {
  return stepScalingMode(mode, 1);
}

/** 1 -> "1x", 0.75 -> "0.75x". No trailing zeros: "1.50x" reads like a price. */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

/** Percentage for the volume / brightness readouts. */
export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

/** "+30s" / "-1:20". Shown while a skip chain is still accumulating. */
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

/**
 * Keeps a seek target inside the timeline.
 *
 * `end` is exclusive by a hair on purpose: seeking to exactly `duration` ends
 * playback, so a user who holds FORWARD would exit the film instead of arriving
 * near the end of it.
 */
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

/**
 * Has a seek arrived where it was aimed?
 *
 * The player holds the scrub bar at a pending target until this says yes, which
 * is what stops the bar flicking backwards: both events that report a seek can
 * carry a position from before the jump, so "the seek is done" has to be decided
 * by proximity rather than by trusting either event.
 *
 * The tolerance is generous on purpose. A keyframe-aligned source lands the
 * playhead near the request rather than on it, and demanding an exact match
 * would leave the target pinned until the safety timeout every time.
 */
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

/**
 * Turns a screen x into a time on the scrub bar, or null if it cannot.
 *
 * Null is the important part. The first version of this returned the start of
 * the timeline whenever it had no measurement, and "the start of the timeline"
 * is indistinguishable from a deliberate request to go back to the beginning --
 * so an unmeasured bar, or a live window that momentarily reported zero length,
 * silently threw the viewer back to 0. A control that does not know where it is
 * should do nothing at all.
 *
 * `windowX` and `track.pageX` must be in the same space; the caller uses screen
 * coordinates for both, because a touch's `locationX` is relative to whichever
 * child view it happened to land on.
 */
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

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/**
 * What a track is called in the settings panel.
 *
 * Streams are inconsistent about this: some name every track, some send only a
 * language code, and plenty of HLS playlists send neither. So the label falls
 * back through title -> language -> ordinal, and the ordinal is 1-based because
 * "Track 0" is a programmer's answer to a viewer's question.
 */
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
    // Some streams put the language in the title already ("English"); some do
    // not ("Commentary"). Appending a code we may already have said is noise, so
    // the title wins outright.
    return title;
  }

  const language = track.language?.trim();
  if (language) {
    return language.toUpperCase();
  }

  return `Track ${position + 1}`;
}

/**
 * Which selection the player is currently on.
 *
 * 'auto' means "whatever the stream and the system locale chose" -- not the same
 * as picking the first track, and the correct default: a stream that marks a
 * forced-subtitle track as default should get it. 'off' only applies to
 * subtitles.
 */
export type TrackSelection = 'auto' | 'off' | number;

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

/**
 * Maps our stored protocol to the value react-native-video actually wants.
 *
 * This is NOT cosmetic, and it is worth knowing why. On Android the library does
 * this with whatever you pass as `source.type`:
 *
 *   type = Util.inferContentType("." + overrideExtension)
 *
 * In other words `type` is treated as a FILE EXTENSION, not a protocol name.
 * Media3 recognises "m3u8" (HLS), "mpd" (DASH) and "ism"/"isml"
 * (SmoothStreaming); anything else -- including the perfectly reasonable-looking
 * "hls" -- infers CONTENT_TYPE_OTHER. That routes the stream through the
 * progressive-download extractors instead of HlsMediaSource, and playback dies
 * with a misleading error that names every extractor except the one you need:
 *
 *   UnrecognizedInputFormatException: None of the available extractors
 *   (FlvExtractor, ... Mp4Extractor, TsExtractor, ...) could read the stream
 *
 * `undefined` for 'other' is deliberate: no hint at all is better than a wrong
 * hint, because Media3 then falls back to inferring from the URL.
 *
 * Keyed on `PlayableProtocol` rather than on `StreamProtocol`, which is what
 * removes the entry that used to sit here for 'youtube'. There was never an
 * extension that would have helped -- that URL is an HTML page and Media3 must
 * never be handed one -- and the map is exhaustive, so narrowing the key is what
 * makes the unplayable case impossible to reach rather than merely commented.
 */
export const MEDIA3_EXTENSION: Record<PlayableProtocol, string | undefined> = {
  hls: 'm3u8',
  dash: 'mpd',
  mp4: 'mp4',
  other: undefined,
};
