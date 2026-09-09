import React, {
  useCallback,
  useEffect,
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
}

/** How long the control overlay stays up after the last input. */
const OVERLAY_TIMEOUT_MS = 4000;

/** How long a gesture readout lingers once the gesture is over. */
const FEEDBACK_LINGER_MS = 700;

/**
 * Seekable window, in seconds, below which a live stream is treated as having no
 * timeline at all.
 *
 * A live HLS playlist always reports *some* seekable duration -- typically three
 * segments, so 6 to 30 seconds, which is just the decoder's own buffer. Offering
 * a scrub bar over that is offering a control with nowhere to go. A genuine DVR
 * window is minutes long, so anything under this is "live, no seeking" and
 * anything over it gets a real bar.
 */
const LIVE_DVR_MIN_SECONDS = 90;

/** How far behind the live edge counts as "not live any more". */
const BEHIND_LIVE_SECONDS = 20;

/**
 * Darkest the brightness gesture can go.
 *
 * Not zero: a swipe that ends in a black screen with the sound still playing is
 * indistinguishable from a crash, and on a phone there is no second control to
 * recover with if the user cannot see the first one.
 */
const MIN_BRIGHTNESS = 0.15;

/** Opacity of the dimming layer at MIN_BRIGHTNESS. */
const MAX_DIM_OPACITY = 0.85;

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
 * ---------------------------------------------------------------------------
 * One player, two interfaces -- and this file is neither of them
 * ---------------------------------------------------------------------------
 * The player is the only screen where a remote and a finger differ by more than
 * layout, because the controls are not always on screen. A remote has keys that
 * can wake them; a finger has nothing to press but the video itself. So the two
 * input models live in their own modules and this file owns only the state they
 * both act on:
 *
 *   useRemoteControl    D-pad and media keys        (TV)
 *   usePlayerGestures   tap, double-tap, swipe,     (touch)
 *                       hold, pinch
 *   PlayerControls      the overlay, in both shapes
 *   SettingsPanel       speed, picture size, tracks
 *   SeekBar             draggable / focusable scrub bar
 *   GestureFeedback     the readouts a gesture needs and a button does not
 *
 * What is deliberately NOT here: any layer that unifies the two. A "player
 * command" abstraction over both input systems sounds tidy and is where TV
 * players go wrong, because the interesting behaviour is exactly the part that
 * differs -- what a press means depends on what has focus, and what a tap means
 * depends on where it landed.
 *
 * ---------------------------------------------------------------------------
 * Seeks accumulate; they are not issued per press
 * ---------------------------------------------------------------------------
 * Every skip -- button, double-tap, arrow key, media key -- calls `nudgeSeek`,
 * which adds to a pending target and restarts a short timer. The seek is issued
 * once, when the user stops. See `SEEK_CHAIN_MS` for why: six presses would
 * otherwise mean six segment fetches and five positions nobody asked to see, and
 * a held-down arrow key repeats at about twenty presses a second.
 *
 * ---------------------------------------------------------------------------
 * Still no full-screen button, on either device
 * ---------------------------------------------------------------------------
 * That control exists to promote a video embedded among other UI. Here the
 * player is a route of its own on every device, so it is already the whole
 * screen and the button would have nothing to do. What a phone gets instead is
 * the picture-size control, which is the question people actually have on a
 * 20:9 screen: letterbox the frame, or crop it to fill.
 */
export function VideoPlayer({
  stream,
  title,
  subtitle,
  onExit,
}: VideoPlayerProps) {
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

  // -------------------------------------------------------------------------
  // The timeline
  // -------------------------------------------------------------------------
  // A live stream's timeline is not [0, duration]. `duration` is 0 or Infinity
  // on a live playlist, and what is actually addressable is the sliding DVR
  // window the server is still holding -- which is why the bar is drawn against
  // `seekableDuration` and not against the duration.
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

  /**
   * Live mirrors of everything the input handlers read.
   *
   * Both the PanResponder and the remote handler are created once and must not
   * close over a render's values: a gesture that started three renders ago would
   * otherwise seek from a stale position. Refs assigned during render are the
   * cheapest correct answer, and the pattern the rest of this app already uses.
   */
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

  /**
   * Keep the overlay up whenever hiding it would hide something the user needs:
   * a paused frame with no explanation reads as a crash, a settings panel that
   * vanishes mid-choice is worse, and a scrub bar that auto-hides out from under
   * a thumb still dragging it is the kind of bug that only shows up on a long
   * film.
   *
   * `scrubbing` is a boolean rather than the preview time, so this re-runs when
   * a drag starts and ends -- not on every one of the sixty position updates a
   * second that a drag produces.
   */
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

  /**
   * `sticky` readouts stay until something replaces or clears them: a swipe is
   * still in progress and its value is still changing. Everything else fades
   * after a moment.
   */
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

  const togglePlayback = useCallback(() => setIsPaused(paused => !paused), []);

  const chainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seekNow = useCallback((target: number) => {
    videoRef.current?.seek(target);
  }, []);

  /**
   * Add to the pending seek target and restart the commit timer.
   *
   * The pending target -- not the current position -- is the base, which is what
   * makes repeated presses accumulate. `onSeek` clears it once Media3 confirms
   * the jump; clearing it here instead would snap the bar back to the old
   * position for the couple of hundred milliseconds the seek takes.
   */
  const nudgeSeek = useCallback(
    (deltaSeconds: number) => {
      const l = live.current;

      if (!l.canSeek) {
        return;
      }

      const base = l.pendingSeek ?? l.currentTime;
      // The timeline always starts at 0, live or not: Media3 reports a live
      // position relative to the start of the seekable window, so the window is
      // already normalised by the time it reaches us.
      const target = clampSeekTarget(base + deltaSeconds, 0, l.timelineEnd);

      live.current.pendingSeek = target;
      setPendingSeek(target);
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

  /**
   * The live scrub target, mirrored out of state.
   *
   * The release event can arrive before React has committed the last move, so
   * reading `scrubPreview` in `onDragEnd` can be one frame stale -- which, at the
   * speed a thumb moves, is a seek to a position the user had already left.
   */
  const scrubTarget = useRef<number | null>(null);

  const handleTap = useCallback(() => {
    // Locked: the tap does nothing to playback, but it must still bring the
    // overlay back, or the Unlock button auto-hides and there is no way left to
    // reach it -- the player would be locked for good.
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
        // A swipe to zero is how a viewer mutes; leaving `muted` set would then
        // make the next swipe up do nothing at all.
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
    showFeedback({ kind: 'rate', rate: HOLD_TO_SPEED_RATE }, { sticky: true });
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

  useRemoteControl(
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
   * Back closes what is on top before it leaves the player.
   *
   * The native stack gives us the hardware BACK button for free, which is what
   * exits the player -- but a Back press with the settings panel open means
   * "close the panel", and with the controls locked it must mean nothing at all.
   * Returning true consumes the press; returning false lets navigation pop the
   * screen exactly as before.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (live.current.settingsOpen) {
          closeSettings();
          return true;
        }
        if (live.current.locked) {
          showFeedback({ kind: 'locked' });
          return true;
        }
        return false;
      },
    );

    return () => subscription.remove();
  }, [closeSettings, showFeedback]);

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

  const handleProgress = useCallback((data: OnProgressData) => {
    setCurrentTime(data.currentTime);
    setBuffered(data.playableDuration);
    setSeekableDuration(data.seekableDuration);
  }, []);

  /**
   * Media3 has arrived. Dropping the pending target here rather than when the
   * seek was issued is what keeps the bar from snapping backwards for the
   * couple of hundred milliseconds a seek takes to land.
   */
  const handleSeek = useCallback((data: OnSeekData) => {
    setCurrentTime(data.currentTime);
    setPendingSeek(null);
    live.current.pendingSeek = null;
  }, []);

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
          style={[styles.dim, { opacity: (1 - brightness) * MAX_DIM_OPACITY }]}
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

      {isBuffering ? (
        <View style={styles.bufferingLayer} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : null}

      {overlayVisible ? (
        <>
          {/* A scrim, not full black: the viewer should still see the picture
              behind the controls, but the text has to stay legible over any
              frame. pointerEvents="none" so it never eats a gesture. */}
          <View style={styles.scrim} pointerEvents="none" />

          <PlayerControls
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
}

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
