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
  Animated,
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
  SelectedVideoTrackType,
  type OnLoadData,
  type OnProgressData,
  type OnSeekData,
  type OnVideoErrorData,
  type OnVideoTracksData,
  type SelectedTrack,
  type SelectedVideoTrack,
  type VideoRef,
} from 'react-native-video';

import type { Playback } from '../services/streamResolver';
import {
  isDefaultPlayerPrefs,
  resetPlayerPrefs,
  setPlayerPref,
  usePlayerPrefs,
  type PlayerPrefs,
} from '../state/playerPrefs';
import { colors, makeStyles, spacing, useMetrics } from '../theme';
import type { Stream } from '../types/content';
import { ControlButton } from './ControlButton';
import { GestureFeedback, type PlayerFeedback } from './GestureFeedback';
import {
  clamp,
  clamp01,
  clampSeekTarget,
  describeTracks,
  describeVideoTracks,
  hasSeekLanded,
  HOLD_TO_SPEED_RATE,
  MEDIA3_EXTENSION,
  nextScalingMode,
  resizeModeFor,
  SEEK_CHAIN_MS,
  SEEK_GESTURE_WINDOW_SECONDS,
  stepScalingMode,
  type ScalingMode,
  type TrackChoice,
  type TrackSelection,
} from './playbackOptions';
import { PlayerControls } from './PlayerControls';
import { resolveOverlayEdges } from './playerLayout';
import { SettingsPanel } from './SettingsPanel';
import { UpNextCard } from './UpNextCard';
import { useOverlayFade } from './useOverlayFade';
import {
  usePlayerGestures,
  type DragAxis,
  type TapZone,
} from './usePlayerGestures';
import { useRemoteControl } from './useRemoteControl';

export interface UpNextItem {
  title: string;
  subtitle?: string;
}

interface VideoPlayerProps {
  playback: Playback;
  title: string;
  subtitle?: string;

  upNext?: UpNextItem;

  onPlayNext?: () => void;

  advancing?: boolean;

  onExit: () => void;

  onCanDismissChange?: (canDismiss: boolean) => void;
}

export interface VideoPlayerHandle {
  dismissTop: () => boolean;
}

const OVERLAY_TIMEOUT_MS = 4000;

const FEEDBACK_LINGER_MS = 700;

const SEEK_SETTLE_TOLERANCE_SECONDS = 1;

const SEEK_SETTLE_TIMEOUT_MS = 4000;

const BUFFER_SPINNER_DELAY_MS = 250;

const LIVE_DVR_MIN_SECONDS = 90;

const BEHIND_LIVE_SECONDS = 20;

const MIN_BRIGHTNESS = 0.15;

const MAX_DIM_OPACITY = 0.85;

const UP_NEXT_COUNTDOWN_MS = 10000;

const COUNTDOWN_TICK_MS = 250;

interface UpNextState {
  deadline: number | null;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  (
    {
      playback,
      title,
      subtitle,
      upNext,
      onPlayNext,
      advancing = false,
      onExit,
      onCanDismissChange,
    },
    ref,
  ) => {
    const metrics = useMetrics();
    const insets = useSafeAreaInsets();
    const styles = useStyles();
    const videoRef = useRef<VideoRef>(null);
    const prefs = usePlayerPrefs();

    const [candidateIndex, setCandidateIndex] = useState(0);
    const candidates = playback.candidates;
    const candidate = candidates[candidateIndex];
    const stream = candidate.stream;

    const [isPaused, setIsPaused] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [seekableDuration, setSeekableDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);

    const [pendingSeek, setPendingSeek] = useState<number | null>(null);

    const [scrubPreview, setScrubPreview] = useState<number | null>(null);

    const seekSettleDeadline = useRef(0);

    const [overlayVisible, setOverlayVisible] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [locked, setLocked] = useState(false);
    const [seekBarFocused, setSeekBarFocused] = useState(false);

    const [rate, setRate] = useState(1);

    const [boosting, setBoosting] = useState(false);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [brightness, setBrightness] = useState(1);
    const [loop, setLoop] = useState(false);

    const [audioTracks, setAudioTracks] = useState<TrackChoice[]>([]);
    const [textTracks, setTextTracks] = useState<TrackChoice[]>([]);
    const [qualities, setQualities] = useState<TrackChoice[]>([]);
    const [selectedAudio, setSelectedAudio] = useState<TrackSelection>('auto');
    const [selectedText, setSelectedText] = useState<TrackSelection>('auto');
    const [selectedQuality, setSelectedQuality] =
      useState<TrackSelection>('auto');
    const [resolution, setResolution] = useState<string | null>(null);
    const [inPictureInPicture, setInPictureInPicture] = useState(false);

    const [sleepMinutes, setSleepMinutes] = useState(0);
    const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
    const [upNextState, setUpNextState] = useState<UpNextState | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const [feedback, setFeedback] = useState<PlayerFeedback | null>(null);

    const scaling = prefs.scaling;

    const timelineEnd = stream.isLive
      ? seekableDuration
      : duration > 0
      ? duration
      : seekableDuration;

    const canSeek = stream.isLive
      ? seekableDuration >= LIVE_DVR_MIN_SECONDS
      : timelineEnd > 0;

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
      isPaused,
      scrubbing: scrubPreview !== null,
      overlayVisible,
      settingsOpen,
      locked,
      seekBarFocused,
      volume,
      brightness,
      inPictureInPicture,
      prefs,
      upNextState,
    });
    live.current = {
      currentTime,
      timelineEnd,
      canSeek,
      pendingSeek,
      isPaused,
      scrubbing: scrubPreview !== null,
      overlayVisible,
      settingsOpen,
      locked,
      seekBarFocused,
      volume,
      brightness,
      inPictureInPicture,
      prefs,
      upNextState,
    };

    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearHideTimer = useCallback(() => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    }, []);

    const revealOverlay = useCallback(() => {
      setOverlayVisible(true);
      live.current.overlayVisible = true;
      clearHideTimer();

      const l = live.current;
      if (l.isPaused || l.settingsOpen || l.scrubbing) {
        return;
      }

      hideTimer.current = setTimeout(
        () => setOverlayVisible(false),
        OVERLAY_TIMEOUT_MS,
      );
    }, [clearHideTimer]);

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

    const overlayFade = useOverlayFade(overlayVisible, metrics.isTouch);

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
        setPlayerPref('scaling', mode);
        showFeedback({ kind: 'scaling', mode });
      },
      [showFeedback],
    );

    const changePref = useCallback(
      <K extends keyof PlayerPrefs>(key: K, value: PlayerPrefs[K]) => {
        setPlayerPref(key, value);
      },
      [],
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
        const step = live.current.prefs.skipStep;
        nudgeSeek(zone === 'left' ? -step : step);
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
          if (live.current.prefs.keepDeviceVolume) {
            return;
          }
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

    const handleSeekBarScrub = useCallback(
      (target: number | null) => {
        setScrubPreview(target);
        if (target === null) {
          fadeFeedback();
          return;
        }
        showFeedback(
          {
            kind: 'scrub',
            deltaSeconds: target - live.current.currentTime,
            target,
          },
          { sticky: true },
        );
      },
      [fadeFeedback, showFeedback],
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
          stepScalingMode(
            live.current.prefs.scaling,
            direction === 'in' ? 1 : -1,
          ),
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

      {
        enabled: metrics.isTouch && !settingsOpen && upNextState === null,
        seekWindowSeconds: SEEK_GESTURE_WINDOW_SECONDS[prefs.seekSpeed],
      },
    );

    const remote = useRemoteControl(
      {
        onWake: revealOverlay,
        onTogglePlay: togglePlayback,
        onPlay: () => setIsPaused(false),
        onPause: () => setIsPaused(true),
        onSkip: direction => nudgeSeek(direction * live.current.prefs.skipStep),
        onMenu: openSettings,
        onStop: onExit,
        shouldSeekWithArrows: () => {
          const l = live.current;
          if (l.settingsOpen || l.locked || !l.canSeek || l.upNextState) {
            return false;
          }
          return !l.overlayVisible || l.seekBarFocused;
        },
      },
      { enabled: metrics.isTV },
    );

    const cancelUpNext = useCallback(() => {
      setUpNextState(null);
      live.current.upNextState = null;
    }, []);

    const dismissTop = useCallback(() => {
      if (live.current.settingsOpen) {
        closeSettings();
        return true;
      }
      if (live.current.upNextState) {
        cancelUpNext();
        return true;
      }
      if (live.current.locked) {
        revealOverlay();
        showFeedback({ kind: 'locked' });
        return true;
      }
      return false;
    }, [cancelUpNext, closeSettings, revealOverlay, showFeedback]);

    useImperativeHandle(ref, () => ({ dismissTop }), [dismissTop]);

    const canDismiss = settingsOpen || locked || upNextState !== null;

    useEffect(() => {
      onCanDismissChange?.(canDismiss);
    }, [canDismiss, onCanDismissChange]);

    useEffect(() => {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        dismissTop,
      );

      return () => subscription.remove();
    }, [dismissTop]);

    useEffect(() => {
      const subscription = AppState.addEventListener('change', state => {
        if (state !== 'active' && !live.current.inPictureInPicture) {
          setIsPaused(true);
        }
      });

      return () => subscription.remove();
    }, []);

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

    const handleVideoTracks = useCallback((data: OnVideoTracksData) => {
      setQualities(describeVideoTracks(data.videoTracks ?? []));
    }, []);

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

        if (data.seekableDuration > 0) {
          setSeekableDuration(data.seekableDuration);
        }
        settlePendingSeek(data.currentTime);
      },
      [settlePendingSeek],
    );

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

    const handleError = useCallback(
      (event: OnVideoErrorData) => {
        const detail =
          event.error?.errorString ??
          event.error?.localizedDescription ??
          event.error?.errorException ??
          'Unknown playback error';

        const next = candidateIndex + 1;

        if (next < candidates.length) {
          console.warn(
            `[VideoPlayer] "${candidates[candidateIndex].label}" failed (${detail}); trying "${candidates[next].label}"`,
          );
          setIsBuffering(true);
          setCandidateIndex(next);
          return;
        }

        setIsBuffering(false);
        setError(detail);
      },
      [candidateIndex, candidates],
    );

    const handlePictureInPictureStatus = useCallback(
      ({ isActive }: { isActive: boolean }) => setInPictureInPicture(isActive),
      [],
    );

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

    const handleAudioBecomingNoisy = useCallback(() => setIsPaused(true), []);

    const startUpNext = useCallback(() => {
      setIsPaused(true);
      setUpNextState({
        deadline: live.current.prefs.autoplayNext
          ? Date.now() + UP_NEXT_COUNTDOWN_MS
          : null,
      });
      revealOverlay();
    }, [revealOverlay]);

    const handleEnd = useCallback(() => {
      if (loop) {
        return;
      }

      if (onPlayNext) {
        startUpNext();
        return;
      }

      onExit();
    }, [loop, onExit, onPlayNext, startUpNext]);

    const playNextNow = useCallback(() => {
      const holding: UpNextState = { deadline: null };
      setUpNextState(holding);
      live.current.upNextState = holding;
      onPlayNext?.();
    }, [onPlayNext]);

    const changeSleepTimer = useCallback((minutes: number) => {
      setSleepMinutes(minutes);
      setSleepDeadline(minutes > 0 ? Date.now() + minutes * 60_000 : null);
    }, []);

    const countdownActive = sleepDeadline !== null || upNextState !== null;

    useEffect(() => {
      if (!countdownActive) {
        return;
      }

      const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
      return () => clearInterval(timer);
    }, [countdownActive]);

    const sleepRemainingMs =
      sleepDeadline === null ? null : Math.max(0, sleepDeadline - now);

    useEffect(() => {
      if (sleepDeadline === null || now < sleepDeadline) {
        return;
      }

      setSleepDeadline(null);
      setSleepMinutes(0);
      setIsPaused(true);
      showFeedback({ kind: 'sleep' });
    }, [now, showFeedback, sleepDeadline]);

    const upNextRemainingMs =
      upNextState?.deadline == null
        ? null
        : Math.max(0, upNextState.deadline - now);

    useEffect(() => {
      if (upNextState?.deadline == null || now < upNextState.deadline) {
        return;
      }

      playNextNow();
    }, [now, playNextNow, upNextState]);

    const retry = useCallback(() => {
      setError(null);
      setIsBuffering(true);
      setCandidateIndex(0);

      videoRef.current?.setSource(buildSource(candidates[0].stream));
    }, [candidates]);

    const source = useMemo(() => buildSource(stream), [stream]);

    const isInitialSource = useRef(true);
    useEffect(() => {
      if (isInitialSource.current) {
        isInitialSource.current = false;
        return;
      }
      videoRef.current?.setSource(source);
    }, [source]);

    useEffect(() => {
      setCandidateIndex(0);
      setError(null);
      setIsBuffering(true);
      setIsPaused(false);
      setCurrentTime(0);
      setDuration(0);
      setSeekableDuration(0);
      setBuffered(0);
      setPendingSeek(null);
      setUpNextState(null);
      setQualities([]);
      setSelectedQuality('auto');
      setSelectedAudio(previous =>
        typeof previous === 'number' ? 'auto' : previous,
      );
      setSelectedText(previous =>
        typeof previous === 'number' ? 'auto' : previous,
      );
    }, [playback]);

    const edges = useMemo(
      () => resolveOverlayEdges(metrics, insets),
      [insets, metrics],
    );

    const subtitleStyle = useMemo(
      () => ({
        fontSize: prefs.subtitleSize,
        paddingBottom: prefs.subtitleLift,
        opacity: prefs.subtitleOpacity,
      }),
      [prefs.subtitleLift, prefs.subtitleOpacity, prefs.subtitleSize],
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

      lines.push(
        candidates.length > 1
          ? `${candidate.label} · ${candidateIndex + 1} of ${candidates.length}`
          : candidate.label,
      );
      return lines;
    }, [
      candidate.label,
      candidateIndex,
      candidates.length,
      resolution,
      stream.isLive,
      stream.protocol,
    ]);

    if (error) {
      return (
        <PlaybackError
          detail={error}
          attempts={candidates.length}
          onRetry={retry}
          onExit={onExit}
        />
      );
    }

    return (
      <View style={styles.root}>
        {}
        <StatusBar hidden />

        <Video
          ref={videoRef}
          source={source}
          style={styles.video}
          resizeMode={resizeModeFor(scaling)}
          paused={isPaused}
          rate={boosting ? HOLD_TO_SPEED_RATE : rate}
          volume={prefs.keepDeviceVolume ? 1 : volume}
          muted={prefs.keepDeviceVolume ? false : muted}
          repeat={loop}
          selectedAudioTrack={trackProp(selectedAudio)}
          selectedTextTrack={trackProp(selectedText)}
          selectedVideoTrack={videoTrackProp(selectedQuality)}
          subtitleStyle={subtitleStyle}
          controls={false}
          progressUpdateInterval={500}
          onLoad={handleLoad}
          onVideoTracks={handleVideoTracks}
          onProgress={handleProgress}
          onSeek={handleSeek}
          onBuffer={handleBuffer}
          onError={handleError}
          onEnd={handleEnd}
          onAudioBecomingNoisy={handleAudioBecomingNoisy}
          onPictureInPictureStatusChanged={handlePictureInPictureStatus}
          preventsDisplaySleepDuringVideoPlayback
        />

        {}
        {brightness < 1 ? (
          <View
            pointerEvents="none"
            style={[
              styles.dim,
              { opacity: (1 - brightness) * MAX_DIM_OPACITY },
            ]}
          />
        ) : null}

        {}
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

        {}
        {metrics.isTV && !overlayVisible && upNextState === null ? (
          <Pressable
            style={styles.wakeLayer}
            focusable
            hasTVPreferredFocus
            onPress={revealOverlay}
            accessibilityLabel="Show playback controls"
            {...remote.keyHandlers}
          />
        ) : null}

        {}
        {overlayFade.mounted && upNextState === null ? (
          <Animated.View
            style={[styles.overlayLayer, { opacity: overlayFade.opacity }]}
            pointerEvents={overlayVisible ? 'box-none' : 'none'}
          >
            <PlayerControls
              keyHandlers={remote.keyHandlers}
              title={title}
              subtitle={subtitle}
              isPaused={isPaused}
              isLive={stream.isLive}
              canSeek={canSeek}
              skipStep={prefs.skipStep}
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
              onScrubPreview={handleSeekBarScrub}
              onSeekBarFocusChange={setSeekBarFocused}
              onOpenSettings={openSettings}
              onCycleScaling={() => applyScaling(nextScalingMode(scaling))}
              onToggleLock={toggleLock}
              onGoLive={goLive}
              onPictureInPicture={
                metrics.isTouch ? enterPictureInPicture : undefined
              }
              onPlayNext={onPlayNext ? playNextNow : undefined}
              onExit={onExit}
            />
          </Animated.View>
        ) : null}

        <GestureFeedback feedback={feedback} />

        {upNextState && upNext ? (
          <UpNextCard
            title={upNext.title}
            subtitle={upNext.subtitle}
            remainingMs={upNextRemainingMs}
            busy={advancing}
            onPlayNow={playNextNow}
            onCancel={cancelUpNext}
            edges={edges}
          />
        ) : null}

        {settingsOpen && metrics.isTouch ? (
          <Pressable
            style={styles.backdrop}
            onPress={closeSettings}
            accessibilityLabel="Close settings"
          />
        ) : null}

        {settingsOpen ? (
          <SettingsPanel
            onClose={closeSettings}
            edges={edges}
            rate={rate}
            onRateChange={next => {
              setRate(next);
              showFeedback({ kind: 'rate', rate: next });
            }}
            qualities={qualities}
            selectedQuality={selectedQuality}
            onSelectQuality={setSelectedQuality}
            scaling={scaling}
            onScalingChange={applyScaling}
            audioTracks={audioTracks}
            selectedAudio={selectedAudio}
            onSelectAudio={setSelectedAudio}
            textTracks={textTracks}
            selectedText={selectedText}
            onSelectText={setSelectedText}
            volume={volume}
            onVolumeChange={next => {
              setVolume(next);
              setMuted(false);
              showFeedback({ kind: 'level', axis: 'volume', value: next });
            }}
            muted={muted}
            onToggleMute={() => setMuted(previous => !previous)}
            loop={loop}
            onToggleLoop={() => setLoop(previous => !previous)}
            sleepMinutes={sleepMinutes}
            sleepRemainingMs={sleepRemainingMs}
            onSleepChange={changeSleepTimer}
            hasUpNext={Boolean(onPlayNext)}
            prefs={prefs}
            onPrefChange={changePref}
            onResetPrefs={resetPlayerPrefs}
            prefsAreDefault={isDefaultPlayerPrefs(prefs)}
            onPictureInPicture={
              metrics.isTouch ? enterPictureInPicture : undefined
            }
            info={streamInfo}
          />
        ) : null}
      </View>
    );
  },
);

VideoPlayer.displayName = 'VideoPlayer';

function trackProp(selection: TrackSelection): SelectedTrack {
  if (selection === 'auto') {
    return { type: SelectedTrackType.SYSTEM };
  }
  if (selection === 'off') {
    return { type: SelectedTrackType.DISABLED };
  }
  return { type: SelectedTrackType.INDEX, value: selection };
}

function videoTrackProp(selection: TrackSelection): SelectedVideoTrack {
  if (typeof selection === 'number') {
    return { type: SelectedVideoTrackType.INDEX, value: selection };
  }
  return { type: SelectedVideoTrackType.AUTO };
}

function buildSource(stream: Stream) {
  return {
    uri: stream.url,
    type: MEDIA3_EXTENSION[stream.protocol],
    headers: stream.headers,
  };
}

function PlaybackError({
  detail,
  attempts,
  onRetry,
  onExit,
}: {
  detail: string;

  attempts: number;
  onRetry: () => void;
  onExit: () => void;
}) {
  const styles = useStyles();

  return (
    <View style={styles.errorRoot}>
      <Text style={styles.errorTitle}>This stream would not play</Text>
      <Text style={styles.errorDetail}>{detail}</Text>
      <Text style={styles.errorHint}>
        {attempts > 1
          ? `All ${attempts} sources for this title were tried and none of them opened. `
          : 'The app reached the server, but the video could not be opened. '}
        Common causes: the stream is offline, the URL has expired, or the source
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
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
