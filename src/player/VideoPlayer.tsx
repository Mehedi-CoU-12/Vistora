import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TVFocusGuideView,
  useTVEventHandler,
  View,
  type HWEvent,
} from 'react-native';
import Video, {
  type OnLoadData,
  type OnProgressData,
  type OnVideoErrorData,
  type VideoRef,
} from 'react-native-video';

import {Badge} from '../components/Badge';
import {Focusable} from '../components/Focusable';
import {colors, radius, spacing, typography} from '../theme';
import type {Stream} from '../types/content';
import type {StreamProtocol} from '../types/database';
import {formatTime} from './formatTime';

interface VideoPlayerProps {
  stream: Stream;
  title: string;
  subtitle?: string;
  /** Leave the player: user pressed Back, or a VOD reached its end. */
  onExit: () => void;
}

/** How long the control overlay stays up after the last remote press. */
const OVERLAY_TIMEOUT_MS = 4000;
const SEEK_STEP_SECONDS = 10;

/** Android KeyEvent.ACTION_UP. The fork emits both down and up for every key. */
const ACTION_UP = 1;

/**
 * ===========================================================================
 * The video player. Note what this file does NOT import.
 * ===========================================================================
 * There is no `supabase`, no `contentService`, no database type anywhere here.
 * The component receives a `Stream` -- a URL, a protocol, and an isLive flag --
 * and plays it. That is the whole contract.
 *
 * This is the architectural boundary that matters most in the project:
 *
 *   contentService   ->  fetches metadata, returns a stream URL
 *   VideoPlayer      ->  receives the URL, opens it directly
 *   Media3/ExoPlayer ->  connects straight to the CDN
 *
 * The video bytes never pass through Supabase. Supabase told us WHERE the video
 * is; the device fetches it itself. Backend bandwidth stays at zero no matter
 * how many 4K streams are playing, which is why there is no proxy, no Edge
 * Function and no Node server in this project.
 *
 * A consequence worth knowing: because the device connects directly, the stream
 * host must be reachable from the device and must accept its requests. If a
 * provider requires a Referer or User-Agent header, that goes in
 * `stream.headers` (stored per row in the database), not into a proxy.
 * ===========================================================================
 *
 * On "full screen": there is no full-screen button, because on a TV the player
 * IS the screen. That control only makes sense on a phone, where video shares
 * space with other UI. Here the surface fills the display and
 * `resizeMode="contain"` letterboxes anything that is not 16:9 -- the honest
 * choice on a fixed panel, since `cover` would silently crop the picture.
 */
export function VideoPlayer({stream, title, subtitle, onExit}: VideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The key handler below needs to know whether the overlay was already up when
   * a key arrived. Reading it from a ref rather than from state avoids a stale
   * closure, since the handler is memoised.
   */
  const overlayVisibleRef = useRef(overlayVisible);
  overlayVisibleRef.current = overlayVisible;

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  /** Show the overlay and restart its auto-hide countdown. */
  const revealOverlay = useCallback(() => {
    setOverlayVisible(true);
    overlayVisibleRef.current = true;
    clearHideTimer();
    hideTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_TIMEOUT_MS);
  }, [clearHideTimer]);

  // Keep the overlay up while paused. Hiding it would leave a frozen frame with
  // no explanation, which reads as a crash.
  useEffect(() => {
    if (isPaused) {
      clearHideTimer();
      setOverlayVisible(true);
      return;
    }
    revealOverlay();
  }, [clearHideTimer, isPaused, revealOverlay]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  const togglePlayback = useCallback(() => setIsPaused(paused => !paused), []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      // A live stream has no stable timeline to seek within, so seeking is a
      // no-op rather than something unpredictable at the live edge.
      if (stream.isLive || duration <= 0) {
        return;
      }
      const target = Math.min(Math.max(currentTime + deltaSeconds, 0), duration);
      videoRef.current?.seek(target);
      setCurrentTime(target);
    },
    [currentTime, duration, stream.isLive],
  );

  /**
   * Remote control handling.
   *
   * ---------------------------------------------------------------------------
   * The rule: left/right SEEK only while the overlay is hidden.
   * ---------------------------------------------------------------------------
   * This is the detail that makes the player feel right, and getting it wrong is
   * the classic TV player bug. The overlay contains a horizontal row of buttons,
   * so while it is visible the platform focus engine needs left/right to move
   * between them. If we also seeked on those presses, every attempt to reach the
   * Back button would scrub the video.
   *
   * So: overlay hidden -> left/right scrub (and wake the overlay); overlay
   * visible -> left/right just move focus, which is what the eye expects when
   * buttons are on screen. Explicit skip buttons cover the discoverable path,
   * and the dedicated media keys work in both states.
   *
   * `useTVEventHandler` is also the ONLY way to see physical media keys
   * (play/pause, rewind, fast-forward). Those never reach a Pressable, because
   * they are not focus events -- they arrive at the activity.
   *
   * Note we never consume the D-pad arrows: they still drive focus normally. We
   * only observe them. Swallowing them would strand the user looking at a button
   * they cannot reach.
   */
  useTVEventHandler(
    useCallback(
      (event: HWEvent) => {
        // Acting on both down and up would double every action.
        if (event.eventKeyAction === ACTION_UP) {
          return;
        }

        const overlayWasVisible = overlayVisibleRef.current;

        switch (event.eventType) {
          case 'playPause':
            revealOverlay();
            togglePlayback();
            break;

          case 'play':
            revealOverlay();
            setIsPaused(false);
            break;

          case 'pause':
            revealOverlay();
            setIsPaused(true);
            break;

          // Dedicated media keys always scrub, overlay or not.
          case 'rewind':
            revealOverlay();
            seekBy(-SEEK_STEP_SECONDS);
            break;

          case 'fastForward':
            revealOverlay();
            seekBy(SEEK_STEP_SECONDS);
            break;

          case 'left':
            revealOverlay();
            if (!overlayWasVisible) {
              seekBy(-SEEK_STEP_SECONDS);
            }
            break;

          case 'right':
            revealOverlay();
            if (!overlayWasVisible) {
              seekBy(SEEK_STEP_SECONDS);
            }
            break;

          default:
            // Any other press simply wakes the overlay.
            revealOverlay();
        }
      },
      [revealOverlay, seekBy, togglePlayback],
    ),
  );

  const handleLoad = useCallback((data: OnLoadData) => {
    setDuration(data.duration);
    setIsBuffering(false);
    setError(null);
  }, []);

  const handleProgress = useCallback((data: OnProgressData) => {
    setCurrentTime(data.currentTime);
  }, []);

  const handleBuffer = useCallback(
    ({isBuffering: buffering}: {isBuffering: boolean}) => setIsBuffering(buffering),
    [],
  );

  const handleError = useCallback((event: OnVideoErrorData) => {
    setIsBuffering(false);
    // Media3's own message is far more useful than a generic string -- "Source
    // error", "Response code: 403" -- so surface it instead of hiding it.
    setError(
      event.error?.errorString ??
        event.error?.localizedDescription ??
        event.error?.errorException ??
        'Unknown playback error',
    );
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setIsBuffering(true);
    // Re-issuing the source is what actually restarts a failed load.
    videoRef.current?.setSource(buildSource(stream));
  }, [stream]);

  if (error) {
    return <PlaybackError detail={error} onRetry={retry} onExit={onExit} />;
  }

  const canSeek = !stream.isLive && duration > 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <View style={styles.root}>
      <Video
        ref={videoRef}
        source={buildSource(stream)}
        style={styles.video}
        resizeMode="contain"
        paused={isPaused}
        // We draw our own overlay, so Media3's built-in control view stays off.
        // It is usable on TV, but it would match nothing else in the app and
        // would compete with our focus model.
        controls={false}
        progressUpdateInterval={500}
        onLoad={handleLoad}
        onProgress={handleProgress}
        onBuffer={handleBuffer}
        onError={handleError}
        onEnd={onExit}
        // Stops the TV dimming or sleeping mid-film.
        preventsDisplaySleepDuringVideoPlayback
      />

      {isBuffering ? (
        <View style={styles.bufferingLayer} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}

      {overlayVisible ? (
        // autoFocus so that waking the overlay puts focus on a real button,
        // rather than leaving it lost behind the video surface.
        <TVFocusGuideView autoFocus style={styles.overlay}>
          <View style={styles.overlayTop}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={styles.overlayBottom}>
            {stream.isLive ? (
              <Text style={styles.hint}>Live broadcast · seeking unavailable</Text>
            ) : (
              <>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, {width: `${progress * 100}%`}]} />
                </View>
                <Text style={styles.time}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </Text>
              </>
            )}

            <View style={styles.controlsRow}>
              {canSeek ? (
                <ControlButton
                  label={`◀◀ ${SEEK_STEP_SECONDS}s`}
                  accessibilityLabel={`Rewind ${SEEK_STEP_SECONDS} seconds`}
                  onPress={() => seekBy(-SEEK_STEP_SECONDS)}
                />
              ) : null}

              <ControlButton
                label={isPaused ? '▶  Play' : '❚❚  Pause'}
                accessibilityLabel={isPaused ? 'Play' : 'Pause'}
                onPress={togglePlayback}
                // The one element that claims focus when the overlay appears.
                hasTVPreferredFocus
              />

              {canSeek ? (
                <ControlButton
                  label={`${SEEK_STEP_SECONDS}s ▶▶`}
                  accessibilityLabel={`Forward ${SEEK_STEP_SECONDS} seconds`}
                  onPress={() => seekBy(SEEK_STEP_SECONDS)}
                />
              ) : null}

              {stream.isLive ? <Badge label="Live" tone="live" /> : null}

              <ControlButton label="Back" accessibilityLabel="Back" onPress={onExit} />
            </View>

            <Text style={styles.hint}>
              OK to select · Back to exit
              {canSeek ? ` · left/right skips ${SEEK_STEP_SECONDS}s once these controls hide` : ''}
            </Text>
          </View>
        </TVFocusGuideView>
      ) : null}
    </View>
  );
}

function ControlButton({
  label,
  accessibilityLabel,
  onPress,
  hasTVPreferredFocus = false,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={styles.controlButton}
      accessibilityLabel={accessibilityLabel}>
      {focused => (
        <Text style={[styles.controlLabel, focused && styles.controlLabelFocused]}>
          {label}
        </Text>
      )}
    </Focusable>
  );
}

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
 */
const MEDIA3_EXTENSION: Record<StreamProtocol, string | undefined> = {
  hls: 'm3u8',
  dash: 'mpd',
  mp4: 'mp4',
  other: undefined,
};

/**
 * Translates our `Stream` into react-native-video's source object.
 *
 * We pass the type explicitly rather than relying on the URL, because plenty of
 * real playlists live at URLs that do not end in a recognisable extension --
 * signed URLs with query strings, or paths like `/tears-of-steel.ism/.m3u8`.
 * Storing the protocol per row means such a source needs no code change.
 */
function buildSource(stream: Stream) {
  return {
    uri: stream.url,
    type: MEDIA3_EXTENSION[stream.protocol],
    headers: stream.headers,
  };
}

function PlaybackError({
  detail,
  onRetry,
  onExit,
}: {
  detail: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>This stream would not play</Text>
      <Text style={styles.errorDetail}>{detail}</Text>
      <Text style={styles.errorHint}>
        The app reached the server, but the video could not be opened. Common causes: the
        stream is offline, the URL has expired, or the source requires headers this device
        is not sending.
      </Text>

      <View style={styles.errorActions}>
        <ControlButton
          label="Try again"
          accessibilityLabel="Try again"
          onPress={onRetry}
          hasTVPreferredFocus
        />
        <ControlButton label="Go back" accessibilityLabel="Go back" onPress={onExit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFill,
  },
  bufferingLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
    // A scrim, not full black: the viewer should still see the picture behind
    // the controls, but the text has to stay legible over any frame.
    backgroundColor: 'rgba(4, 6, 12, 0.55)',
  },
  overlayTop: {
    gap: 2,
  },
  overlayBottom: {
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  controlButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  controlLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  controlLabelFocused: {
    color: colors.accent,
  },
  time: {
    ...typography.caption,
    color: colors.textSecondary,
    // Stops the readout jittering as the digits change.
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.background,
  },
  errorTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorDetail: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  errorHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 620,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
});
