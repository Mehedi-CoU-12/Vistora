import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video, {
  SelectedTrackType,
  type OnLoadData,
  type OnProgressData,
  type OnSeekData,
  type OnVideoErrorData,
  type SelectedTrack,
  type VideoRef,
} from 'react-native-video';

import { colors, makeStyles, spacing, useMetrics } from '../theme';
import type { Stream } from '../types/content';
import { ControlButton } from './ControlButton';
import { GestureFeedback, type PlayerFeedback } from './GestureFeedback';
import {
  clamp,
  clamp01,
  clampSeekTarget,
  describeTracks,
  hasSeekLanded,
  HOLD_TO_SPEED_RATE,
  MEDIA3_EXTENSION,
  nextScalingMode,
  resizeModeFor,
  SEEK_CHAIN_MS,
  SEEK_STEP_SECONDS,
  stepScalingMode,
  type ScalingMode,
  type TrackChoice,
  type TrackSelection,
} from './playbackOptions';
import { PlayerControls } from './PlayerControls';
import { resolveOverlayEdges } from './playerLayout';
import { SettingsPanel } from './SettingsPanel';
import {
  usePlayerGestures,
  type DragAxis,
  type TapZone,
} from './usePlayerGestures';
import { useRemoteControl } from './useRemoteControl';

interface VideoPlayerProps {
  stream: Stream;
  title: string;
  subtitle?: string;
  /** Leave the player: user pressed Back, or a VOD reached its end. */
  onExit: () => void;
  /**
   * Reports whether the player currently has something a Back press should
   * close rather than leave: an open settings panel, or the lock.
   *
   * The player cannot intercept Back by itself, and the reason is worth knowing.
   * `BackHandler` is the documented way and it does not run here: the native
   * stack (react-native-screens) pops the route natively, so the press never
   * reaches a JavaScript handler -- verified on device, where Back with the
   * settings panel open exited the player instead of closing the panel. Only
   * the navigator can prevent that, so `PlayerScreen` does it with
   * `usePreventRemove`, using this callback and the `dismissTop` handle below.
   *
   * Keeping it a callback rather than importing navigation here is what lets
   * this component stay embeddable in something that is not a route at all.
   */
  onCanDismissChange?: (canDismiss: boolean) => void;
}

export interface VideoPlayerHandle {
  /**
   * Close the topmost thing the player has open. Returns true if something was
   * closed, so the caller knows whether it still has a Back press to spend.
   */
  dismissTop: () => boolean;
}

/** How long the control overlay stays up after the last input. */
const OVERLAY_TIMEOUT_MS = 4000;

/** How long a gesture readout lingers once the gesture is over. */
const FEEDBACK_LINGER_MS = 700;

/**
 * How close playback must get to a pending seek target before the readout stops
 * showing the target and starts showing the real position again.
 *
 * ---------------------------------------------------------------------------
 * This is the fix for the scrub bar flicking backwards after a seek.
 * ---------------------------------------------------------------------------
 * A seek does not land instantly, and the two events that report it disagree
 * for a moment. In react-native-video's Android code, `onSeek` fires from
 * `onIsPlayingChanged` and carries `player.getCurrentPosition()` -- taken when
 * playback resumes, which can still be the position from BEFORE the jump. And
 * `onProgress` keeps ticking on its own 500ms timer, so it reports stale
 * positions too while Media3 flushes its decoder.
 *
 * Dropping the pending target on `onSeek` therefore handed the bar an old
 * position for up to half a second: it snapped back to where the finger started,
 * then jumped forward again when the next progress tick arrived. So instead the
 * target is held until playback demonstrably reaches it, and the bar only ever
 * moves in the direction the user asked for.
 */
const SEEK_SETTLE_TOLERANCE_SECONDS = 1;

/**
 * Safety valve for the above: stop waiting for a seek that never lands.
 *
 * A target can be unreachable -- a live edge that has moved on, a source that
 * refuses the position -- and a pending target held forever would freeze the
 * readout while the video played on behind it.
 */
const SEEK_SETTLE_TIMEOUT_MS = 4000;

/**
 * How long buffering must last before the spinner appears.
 *
 * Every seek buffers briefly, and a spinner that flashes up for 150ms on each
 * one is a flicker in its own right. Waiting a moment means the spinner only
 * shows up for stalls the viewer had already noticed.
 */
const BUFFER_SPINNER_DELAY_MS = 250;

const LIVE_DVR_MIN_SECONDS = 90;

/** How far behind the live edge counts as "not live any more". */
const BEHIND_LIVE_SECONDS = 20;

const MIN_BRIGHTNESS = 0.15;

/** Opacity of the dimming layer at MIN_BRIGHTNESS. */
const MAX_DIM_OPACITY = 0.85;

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ stream, title, subtitle, onExit, onCanDismissChange }, ref) => {
    const metrics = useMetrics();
    const insets = useSafeAreaInsets();
    const styles = useStyles();
    const videoRef = useRef<VideoRef>(null);

    const [isPaused, setIsPaused] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    /** Length of the seekable window, which is the whole timeline on a live edge. */
    const [seekableDuration, setSeekableDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);

    /** Where the playhead is going, while a chain of skips is still open. */
    const [pendingSeek, setPendingSeek] = useState<number | null>(null);
    /** Where a finger is holding the scrub bar or a swipe, before release. */
    const [scrubPreview, setScrubPreview] = useState<number | null>(null);

    /**
     * When to give up waiting for the pending seek to land. Armed whenever a
     * target is set, so an accumulating chain of skips cannot expire mid-chain.
     */
    const seekSettleDeadline = useRef(0);

    const [overlayVisible, setOverlayVisible] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const [seekBarFocused, setSeekBarFocused] = useState(false);

    const [rate, setRate] = useState(1);
    /** Press-and-hold speed boost, which must not overwrite the chosen speed. */
    const [boosting, setBoosting] = useState(false);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [brightness, setBrightness] = useState(1);
    const [scaling, setScaling] = useState<ScalingMode>('fit');
    const [loop, setLoop] = useState(false);

    const [audioTracks, setAudioTracks] = useState<TrackChoice[]>([]);
    const [textTracks, setTextTracks] = useState<TrackChoice[]>([]);
    const [selectedAudio, setSelectedAudio] = useState<TrackSelection>('auto');
    const [selectedText, setSelectedText] = useState<TrackSelection>('auto');
    const [resolution, setResolution] = useState<string | null>(null);
    const [inPictureInPicture, setInPictureInPicture] = useState(false);

    const [feedback, setFeedback] = useState<PlayerFeedback | null>(null);

    const timelineEnd = stream.isLive
      ? seekableDuration
      : duration > 0
      ? duration
      : seekableDuration;

    const canSeek = stream.isLive
      ? seekableDuration >= LIVE_DVR_MIN_SECONDS
      : timelineEnd > 0;

    /** What to draw: a pending target beats the real position, which beats nothing. */
    const displayPosition = scrubPreview ?? pendingSeek ?? currentTime;

    const behindLive =
      stream.isLive &&
      canSeek &&
      timelineEnd - displayPosition > BEHIND_LIVE_SECONDS;

    const live = useRef({
      currentTime,
      timelineEnd,
      canSeek,
      pendingSeek,
      overlayVisible,
      settingsOpen,
      locked,
      seekBarFocused,
      volume,
      brightness,
      scaling,
      inPictureInPicture,
    });
    live.current = {
      currentTime,
      timelineEnd,
      canSeek,
      pendingSeek,
      overlayVisible,
      settingsOpen,
      locked,
      seekBarFocused,
      volume,
      brightness,
      scaling,
      inPictureInPicture,
    };

    // -------------------------------------------------------------------------
    // Overlay visibility
    // -------------------------------------------------------------------------

    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimer = useCallback(() => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }, []);

    /** Show the overlay and restart its auto-hide countdown. */
    const revealOverlay = useCallback(() => {
      setOverlayVisible(true);
      live.current.overlayVisible = true;
      clearHideTimer();
      hideTimer.current = setTimeout(
        () => setOverlayVisible(false),
        OVERLAY_TIMEOUT_MS,
      );
    }, [clearHideTimer]);

    /** Put the overlay away now, because the user asked. Touch only. */
    const dismissOverlay = useCallback(() => {
      clearHideTimer();
      setOverlayVisible(false);
      live.current.overlayVisible = false;
    }, [clearHideTimer]);

    const scrubbing = scrubPreview !== null;

    useEffect(() => {
      if (isPaused || settingsOpen || scrubbing) {
        clearHideTimer();
        setOverlayVisible(true);
        return;
      }
      revealOverlay();
    }, [clearHideTimer, isPaused, revealOverlay, scrubbing, settingsOpen]);

    useEffect(() => clearHideTimer, [clearHideTimer]);

    // -------------------------------------------------------------------------
    // Feedback readouts
    // -------------------------------------------------------------------------

    const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showFeedback = useCallback(
      (next: PlayerFeedback, { sticky = false }: { sticky?: boolean } = {}) => {
        if (feedbackTimer.current) {
          clearTimeout(feedbackTimer.current);
          feedbackTimer.current = null;
        }
        setFeedback(next);
        if (!sticky) {
          feedbackTimer.current = setTimeout(
            () => setFeedback(null),
            FEEDBACK_LINGER_MS,
          );
        }
      },
      [],
    );

    const fadeFeedback = useCallback(() => {
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
      }
      feedbackTimer.current = setTimeout(
        () => setFeedback(null),
        FEEDBACK_LINGER_MS,
      );
    }, []);

    useEffect(
      () => () => {
        if (feedbackTimer.current) {
          clearTimeout(feedbackTimer.current);
        }
      },
      [],
    );

    // -------------------------------------------------------------------------
    // Playback commands
    // -------------------------------------------------------------------------

    const togglePlayback = useCallback(
      () => setIsPaused(paused => !paused),
      [],
    );

    const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const seekNow = useCallback((target: number) => {
      videoRef.current?.seek(target);
    }, []);

    const nudgeSeek = useCallback(
      (deltaSeconds: number) => {
        const l = live.current;

        if (!l.canSeek) {
          return;
        }

        const base = l.pendingSeek ?? l.currentTime;
        const target = clampSeekTarget(base + deltaSeconds, 0, l.timelineEnd);

        live.current.pendingSeek = target;
        setPendingSeek(target);
        // The chain has not been issued yet, so the deadline has to cover the
        // wait for the last press as well as the seek itself.
        seekSettleDeadline.current =
          Date.now() + SEEK_CHAIN_MS + SEEK_SETTLE_TIMEOUT_MS;
        showFeedback({
          kind: 'skip',
          deltaSeconds: target - l.currentTime,
          target,
        });
        revealOverlay();

        if (chainTimer.current) {
          clearTimeout(chainTimer.current);
        }
        chainTimer.current = setTimeout(() => {
          chainTimer.current = null;
          seekNow(target);
        }, SEEK_CHAIN_MS);
      },
      [revealOverlay, seekNow, showFeedback],
    );

    /** A seek the user has already aimed: a bar drag, or a jump to the live edge. */
    const seekTo = useCallback(
      (target: number) => {
        const l = live.current;
        if (!l.canSeek) {
          return;
        }
        if (chainTimer.current) {
          clearTimeout(chainTimer.current);
          chainTimer.current = null;
        }
        const clamped = clampSeekTarget(target, 0, l.timelineEnd);
        live.current.pendingSeek = clamped;
        setPendingSeek(clamped);
        seekSettleDeadline.current = Date.now() + SEEK_SETTLE_TIMEOUT_MS;
        seekNow(clamped);
        revealOverlay();
      },
      [revealOverlay, seekNow],
    );

    const goLive = useCallback(() => {
      seekTo(live.current.timelineEnd);
    }, [seekTo]);

    useEffect(
      () => () => {
        if (chainTimer.current) {
          clearTimeout(chainTimer.current);
        }
      },
      [],
    );

    const applyScaling = useCallback(
      (mode: ScalingMode) => {
        setScaling(mode);
        live.current.scaling = mode;
        showFeedback({ kind: 'scaling', mode });
      },
      [showFeedback],
    );

    const toggleLock = useCallback(() => {
      setLocked(previous => {
        const next = !previous;
        live.current.locked = next;
        if (next) {
          showFeedback({ kind: 'locked' });
        }
        return next;
      });
      revealOverlay();
    }, [revealOverlay, showFeedback]);

    const openSettings = useCallback(() => {
      setSettingsOpen(true);
      live.current.settingsOpen = true;
    }, []);

    const closeSettings = useCallback(() => {
      setSettingsOpen(false);
      live.current.settingsOpen = false;
      revealOverlay();
    }, [revealOverlay]);

    const enterPictureInPicture = useCallback(() => {
      videoRef.current?.enterPictureInPicture();
    }, []);

    // -------------------------------------------------------------------------
    // Touch gestures
    // -------------------------------------------------------------------------

    /** Values captured when a drag began; every drag reports travel from there. */
    const dragBase = useRef({ position: 0, volume: 1, brightness: 1 });

    const scrubTarget = useRef<number | null>(null);

    const handleTap = useCallback(() => {
      if (live.current.locked) {
        revealOverlay();
        showFeedback({ kind: 'locked' });
        return;
      }

      if (live.current.overlayVisible) {
        dismissOverlay();
      } else {
        revealOverlay();
      }
    }, [dismissOverlay, revealOverlay, showFeedback]);

    const handleDoubleTap = useCallback(
      (zone: TapZone) => {
        if (live.current.locked) {
          return;
        }
        if (zone === 'centre') {
          togglePlayback();
          return;
        }
        nudgeSeek(zone === 'left' ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
      },
      [nudgeSeek, togglePlayback],
    );

    const handleDragStart = useCallback(
      (axis: DragAxis) => {
        const l = live.current;
        if (l.locked) {
          return;
        }
        dragBase.current = {
          position: l.pendingSeek ?? l.currentTime,
          volume: l.volume,
          brightness: l.brightness,
        };
        if (axis === 'seek') {
          revealOverlay();
        }
      },
      [revealOverlay],
    );

    const handleDragMove = useCallback(
      (axis: DragAxis, amount: number) => {
        if (live.current.locked) {
          return;
        }

        const base = dragBase.current;

        if (axis === 'seek') {
          if (!live.current.canSeek) {
            return;
          }
          const target = clampSeekTarget(
            base.position + amount,
            0,
            live.current.timelineEnd,
          );
          scrubTarget.current = target;
          setScrubPreview(target);
          showFeedback(
            {
              kind: 'scrub',
              deltaSeconds: target - live.current.currentTime,
              target,
            },
            { sticky: true },
          );
          return;
        }

        if (axis === 'volume') {
          const next = clamp01(base.volume + amount);
          setVolume(next);
          live.current.volume = next;
          setMuted(false);
          showFeedback(
            { kind: 'level', axis: 'volume', value: next },
            { sticky: true },
          );
          return;
        }

        const next = clamp(base.brightness + amount, MIN_BRIGHTNESS, 1);
        setBrightness(next);
        live.current.brightness = next;
        showFeedback(
          { kind: 'level', axis: 'brightness', value: next },
          { sticky: true },
        );
      },
      [showFeedback],
    );

    const handleDragEnd = useCallback(
      (axis: DragAxis, committed: boolean) => {
        if (axis === 'seek') {
          const target = scrubTarget.current;
          scrubTarget.current = null;
          setScrubPreview(null);
          if (committed && target !== null) {
            seekTo(target);
          }
        }
        fadeFeedback();
      },
      [fadeFeedback, seekTo],
    );

    const handleHoldStart = useCallback(() => {
      if (live.current.locked) {
        return;
      }
      setBoosting(true);
      showFeedback(
        { kind: 'rate', rate: HOLD_TO_SPEED_RATE },
        { sticky: true },
      );
    }, [showFeedback]);

    const handleHoldEnd = useCallback(() => {
      setBoosting(false);
      fadeFeedback();
    }, [fadeFeedback]);

    const handlePinch = useCallback(
      (direction: 'in' | 'out') => {
        if (live.current.locked) {
          return;
        }
        applyScaling(
          stepScalingMode(live.current.scaling, direction === 'in' ? 1 : -1),
        );
      },
      [applyScaling],
    );

    const gestures = usePlayerGestures(
      {
        onTap: handleTap,
        onDoubleTap: handleDoubleTap,
        onDragStart: handleDragStart,
        onDragMove: handleDragMove,
        onDragEnd: handleDragEnd,
        onHoldStart: handleHoldStart,
        onHoldEnd: handleHoldEnd,
        onPinch: handlePinch,
      },
      // Still enabled while locked, deliberately: the handlers refuse individually
      // (see `handleTap`), which is what lets a tap say "locked" and re-show the
      // Unlock button while every gesture that would change playback is ignored.
      // Switching the responder off entirely would be a player with no way back.
      { enabled: metrics.isTouch && !settingsOpen },
    );

    // -------------------------------------------------------------------------
    // Remote control
    // -------------------------------------------------------------------------

    const remote = useRemoteControl(
      {
        onWake: revealOverlay,
        onTogglePlay: togglePlayback,
        onPlay: () => setIsPaused(false),
        onPause: () => setIsPaused(true),
        onSkip: direction => nudgeSeek(direction * SEEK_STEP_SECONDS),
        onMenu: openSettings,
        onStop: onExit,
        shouldSeekWithArrows: () => {
          const l = live.current;
          if (l.settingsOpen || l.locked || !l.canSeek) {
            return false;
          }
          return !l.overlayVisible || l.seekBarFocused;
        },
      },
      { enabled: metrics.isTV },
    );

    /**
     * Close whatever is on top: the settings panel, or nothing while locked.
     *
     * Shared by both Back paths -- the navigator's interception (see
     * `onCanDismissChange`) and the `BackHandler` below -- so the two can never
     * disagree about what a Back press means.
     */
    const dismissTop = useCallback(() => {
      if (live.current.settingsOpen) {
        closeSettings();
        return true;
      }
      if (live.current.locked) {
        // Locked absorbs Back and says so, rather than silently eating it.
        revealOverlay();
        showFeedback({ kind: 'locked' });
        return true;
      }
      return false;
    }, [closeSettings, revealOverlay, showFeedback]);

    useImperativeHandle(ref, () => ({ dismissTop }), [dismissTop]);

    const canDismiss = settingsOpen || locked;

    useEffect(() => {
      onCanDismissChange?.(canDismiss);
    }, [canDismiss, onCanDismissChange]);

    /**
     * The BackHandler path, kept as well as the navigator one.
     *
     * It is dead under the native stack on Android -- the route is popped
     * natively before JavaScript sees the press -- but it is the only path on a
     * host that is not a native-stack route, and it costs one listener. Where both
     * are live, this one consumes the press first and the navigator's callback
     * never runs, so there is no double dismissal.
     */
    useEffect(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        dismissTop,
      );

      return () => subscription.remove();
    }, [dismissTop]);

    /**
     * Leaving the app pauses playback -- unless the player is in a
     * picture-in-picture window, where being in the background is the whole point.
     */
    useEffect(() => {
      const subscription = AppState.addEventListener('change', state => {
        if (state !== 'active' && !live.current.inPictureInPicture) {
          setIsPaused(true);
        }
      });

      return () => subscription.remove();
    }, []);

    // -------------------------------------------------------------------------
    // Player events
    // -------------------------------------------------------------------------

    const handleLoad = useCallback((data: OnLoadData) => {
      setDuration(Number.isFinite(data.duration) ? data.duration : 0);
      setIsBuffering(false);
      setError(null);
      setAudioTracks(describeTracks(data.audioTracks ?? []));
      setTextTracks(describeTracks(data.textTracks ?? []));
      if (data.naturalSize?.width) {
        setResolution(
          `${Math.round(data.naturalSize.width)} x ${Math.round(
            data.naturalSize.height,
          )}`,
        );
      }
    }, []);

    /**
     * Drop the pending target, but only once it means something.
     *
     * `settle` is the whole flicker fix: the target stays in place until a
     * reported position is actually near it. The real position is still recorded
     * on every tick -- `displayPosition` simply prefers the target while one is
     * pending, so nothing the viewer sees moves backwards.
     */
    const settlePendingSeek = useCallback((reportedTime: number) => {
      const pending = live.current.pendingSeek;
      if (pending === null) {
        return;
      }

      const landed = hasSeekLanded(
        reportedTime,
        pending,
        SEEK_SETTLE_TOLERANCE_SECONDS,
      );

      if (landed || Date.now() > seekSettleDeadline.current) {
        live.current.pendingSeek = null;
        setPendingSeek(null);
      }
    }, []);

    const handleProgress = useCallback(
      (data: OnProgressData) => {
        setCurrentTime(data.currentTime);
        setBuffered(data.playableDuration);
        // Ignore a zero-length seekable window rather than storing it. Media3
        // reports one transiently -- while a live playlist reloads, and around a
        // seek -- and storing it collapses the timeline to nothing, which makes
        // the bar's fill snap to the far left and every position on it map to
        // the start. Keeping the last real window is always closer to the truth.
        if (data.seekableDuration > 0) {
          setSeekableDuration(data.seekableDuration);
        }
        settlePendingSeek(data.currentTime);
      },
      [settlePendingSeek],
    );

    /**
     * Media3 says the seek is done. Worth acting on because it usually arrives
     * before the next progress tick, but not worth trusting on its own: the
     * position it carries is read when playback resumes and can predate the
     * jump, which is exactly what used to make the bar flick backwards.
     */
    const handleSeek = useCallback(
      (data: OnSeekData) => {
        setCurrentTime(data.currentTime);
        settlePendingSeek(data.currentTime);
      },
      [settlePendingSeek],
    );

    const handleBuffer = useCallback(
      ({ isBuffering: buffering }: { isBuffering: boolean }) =>
        setIsBuffering(buffering),
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

    const handlePictureInPictureStatus = useCallback(
      ({ isActive }: { isActive: boolean }) => setInPictureInPicture(isActive),
      [],
    );

    /**
     * The spinner trails the buffering state by a moment. See
     * BUFFER_SPINNER_DELAY_MS: without it, every seek flashes a spinner over the
     * picture for the fraction of a second Media3 spends refilling.
     */
    const [spinnerVisible, setSpinnerVisible] = useState(false);

    useEffect(() => {
      if (!isBuffering) {
        setSpinnerVisible(false);
        return;
      }

      const timer = setTimeout(
        () => setSpinnerVisible(true),
        BUFFER_SPINNER_DELAY_MS,
      );

      return () => clearTimeout(timer);
    }, [isBuffering]);

    /** Unplugging headphones must not start playing a film to the room. */
    const handleAudioBecomingNoisy = useCallback(() => setIsPaused(true), []);

    const handleEnd = useCallback(() => {
      if (!loop) {
        onExit();
      }
    }, [loop, onExit]);

    const retry = useCallback(() => {
      setError(null);
      setIsBuffering(true);
      // Re-issuing the source is what actually restarts a failed load.
      videoRef.current?.setSource(buildSource(stream));
    }, [stream]);

    const source = useMemo(() => buildSource(stream), [stream]);
    const edges = useMemo(
      () => resolveOverlayEdges(metrics, insets),
      [insets, metrics],
    );

    const streamInfo = useMemo(() => {
      const lines = [
        `${stream.protocol.toUpperCase()} · ${
          stream.isLive ? 'live' : 'on demand'
        }`,
      ];
      if (resolution) {
        lines.push(resolution);
      }
      return lines;
    }, [resolution, stream.isLive, stream.protocol]);

    if (error) {
      return <PlaybackError detail={error} onRetry={retry} onExit={onExit} />;
    }

    return (
      <View style={styles.root}>
        {/* Full screen on both devices: a status bar over a film is a status bar
          over a film, remote or no remote. */}
        <StatusBar hidden />

        <Video
          ref={videoRef}
          source={source}
          style={styles.video}
          resizeMode={resizeModeFor(scaling)}
          paused={isPaused}
          // The chosen speed, unless a finger is holding the screen down.
          rate={boosting ? HOLD_TO_SPEED_RATE : rate}
          volume={volume}
          muted={muted}
          repeat={loop}
          selectedAudioTrack={trackProp(selectedAudio)}
          selectedTextTrack={trackProp(selectedText)}
          // We draw our own overlay, so Media3's built-in control view stays off.
          // It is usable on TV, but it would match nothing else in the app and
          // would compete with our focus model.
          controls={false}
          // Twice a second: enough for the bar to look continuous, and few enough
          // JS bridge crossings that a 4K stream does not pay for the readout.
          progressUpdateInterval={500}
          onLoad={handleLoad}
          onProgress={handleProgress}
          onSeek={handleSeek}
          onBuffer={handleBuffer}
          onError={handleError}
          onEnd={handleEnd}
          onAudioBecomingNoisy={handleAudioBecomingNoisy}
          onPictureInPictureStatusChanged={handlePictureInPictureStatus}
          // Stops the display dimming or sleeping mid-film.
          preventsDisplaySleepDuringVideoPlayback
        />

        {/*
        The brightness gesture dims the picture rather than the backlight.
        Changing the screen's actual brightness needs a native module this
        project does not have, and would also change it for the whole system --
        so this is a layer over the video, which is honest about what it does:
        it makes a too-bright film watchable in the dark without touching the
        controls drawn on top of it, which stay legible.
      */}
        {brightness < 1 ? (
          <View
            pointerEvents="none"
            style={[
              styles.dim,
              { opacity: (1 - brightness) * MAX_DIM_OPACITY },
            ]}
          />
        ) : null}

        {/*
        The gesture layer sits BELOW the controls and above the video. Order is
        the whole mechanism: a press on a button is handled by the button, and a
        touch anywhere else falls through to here.
      */}
        {metrics.isTouch ? (
          <View
            style={styles.gestureLayer}
            onLayout={gestures.onLayout}
            {...gestures.panHandlers}
          />
        ) : null}

        {spinnerVisible ? (
          <View style={styles.bufferingLayer} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : null}

        {/*
        TV only, and the reason the controls can always be recovered.
        =============================================================
        With the overlay hidden, the player would otherwise contain no focusable
        view at all -- and under the New Architecture that means no key events
        either, because JSKeyDispatcher only dispatches to a FOCUSED view and
        returns early when there is none. The result was a player whose controls
        auto-hid after four seconds and could never be brought back: every D-pad
        press went nowhere and only BACK, handled natively, did anything.

        So while the controls are hidden, one invisible focusable layer holds
        focus and carries the key handlers. OK wakes the overlay; left and right
        still scrub, because with a single focusable view on screen the focus
        engine has nowhere to move and the press arrives here instead.

        Not needed on a phone: the gesture layer above already takes every touch.
      */}
        {metrics.isTV && !overlayVisible ? (
          <Pressable
            style={styles.wakeLayer}
            focusable
            hasTVPreferredFocus
            onPress={revealOverlay}
            accessibilityLabel="Show playback controls"
            {...remote.keyHandlers}
          />
        ) : null}

        {overlayVisible ? (
          <>
            {/* A scrim, not full black: the viewer should still see the picture
              behind the controls, but the text has to stay legible over any
              frame. pointerEvents="none" so it never eats a gesture. */}
            <View style={styles.scrim} pointerEvents="none" />

            <PlayerControls
              keyHandlers={remote.keyHandlers}
              title={title}
              subtitle={subtitle}
              isPaused={isPaused}
              isLive={stream.isLive}
              canSeek={canSeek}
              position={displayPosition}
              start={0}
              end={timelineEnd}
              buffered={buffered}
              rate={rate}
              scaling={scaling}
              locked={locked}
              behindLive={behindLive}
              edges={edges}
              onTogglePlay={togglePlayback}
              onSkip={nudgeSeek}
              onSeek={seekTo}
              onScrubPreview={setScrubPreview}
              onSeekBarFocusChange={setSeekBarFocused}
              onOpenSettings={openSettings}
              onCycleScaling={() => applyScaling(nextScalingMode(scaling))}
              onToggleLock={toggleLock}
              onGoLive={goLive}
              onExit={onExit}
            />
          </>
        ) : null}

        <GestureFeedback feedback={feedback} />

        {settingsOpen && metrics.isTouch ? (
          // Tapping away from a sheet closes it: the touch idiom, and the reason
          // the panel needs no visible dismiss target of its own on a phone. A TV
          // gets no backdrop -- BACK closes the panel, and a focusable full-screen
          // view would be somewhere for D-pad focus to fall into.
          <Pressable
            style={styles.backdrop}
            onPress={closeSettings}
            accessibilityLabel="Close settings"
          />
        ) : null}

        {settingsOpen ? (
          <SettingsPanel
            onClose={closeSettings}
            rate={rate}
            onRateChange={next => {
              setRate(next);
              showFeedback({ kind: 'rate', rate: next });
            }}
            scaling={scaling}
            onScalingChange={applyScaling}
            audioTracks={audioTracks}
            selectedAudio={selectedAudio}
            onSelectAudio={setSelectedAudio}
            textTracks={textTracks}
            selectedText={selectedText}
            onSelectText={setSelectedText}
            muted={muted}
            onToggleMute={() => setMuted(previous => !previous)}
            loop={loop}
            onToggleLoop={() => setLoop(previous => !previous)}
            onPictureInPicture={
              metrics.isTouch ? enterPictureInPicture : undefined
            }
            info={streamInfo}
            edges={edges}
          />
        ) : null}
      </View>
    );
  },
);

// forwardRef renders an anonymous component, so name it for the devtools tree
// and for any warning that has to point at it.
VideoPlayer.displayName = 'VideoPlayer';

/**
 * Our track selection -> the prop react-native-video wants.
 *
 * 'auto' maps to SYSTEM rather than to "no prop at all", which matters: a stream
 * can mark a track as the one to use, and SYSTEM is what honours that plus the
 * device's own language preference.
 */
function trackProp(selection: TrackSelection): SelectedTrack {
  if (selection === 'auto') {
    return { type: SelectedTrackType.SYSTEM };
  }
  if (selection === 'off') {
    return { type: SelectedTrackType.DISABLED };
  }
  return { type: SelectedTrackType.INDEX, value: selection };
}

/**
 * Translates our `Stream` into react-native-video's source object.
 *
 * We pass the type explicitly rather than relying on the URL, because plenty of
 * real playlists live at URLs that do not end in a recognisable extension --
 * signed URLs with query strings, or paths like `/tears-of-steel.ism/.m3u8`.
 * Storing the protocol per row means such a source needs no code change. See
 * `MEDIA3_EXTENSION` for why the value is a file extension and not a protocol.
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
  const styles = useStyles();

  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>This stream would not play</Text>
      <Text style={styles.errorDetail}>{detail}</Text>
      <Text style={styles.errorHint}>
        The app reached the server, but the video could not be opened. Common
        causes: the stream is offline, the URL has expired, or the source
        requires headers this device is not sending.
      </Text>

      <View style={styles.errorActions}>
        <ControlButton
          label="Try again"
          accessibilityLabel="Try again"
          onPress={onRetry}
          hasTVPreferredFocus
        />
        <ControlButton
          label="Go back"
          accessibilityLabel="Go back"
          onPress={onExit}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(metrics => ({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Spelled out rather than StyleSheet.absoluteFillObject: this React Native
  // version's types only declare `absoluteFill` (a registered style ID), which
  // cannot be spread into a style object.
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  gestureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  wakeLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Invisible on purpose: it is a focus holder and a key target, not a
    // control. Anything drawn here would be furniture over a film.
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 6, 12, 0.55)',
  },
  bufferingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: metrics.gutter.horizontal,
    backgroundColor: colors.background,
  },
  errorTitle: {
    ...metrics.typography.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorDetail: {
    ...metrics.typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  errorHint: {
    ...metrics.typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 620,
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
}));
