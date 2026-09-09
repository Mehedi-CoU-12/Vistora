import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { colors, makeStyles, radius, useMetrics } from '../theme';
import { formatTime } from './formatTime';
import { clamp01, clampSeekTarget } from './playbackOptions';
import { resolvePlayerChrome } from './playerLayout';

interface SeekBarProps {
  /** Playhead position, in seconds on the same scale as `start`/`end`. */
  position: number;
  /**
   * The seekable window. `start` is 0 for a film, and non-zero for a live stream
   * with a DVR buffer, where the oldest available moment slides forward as the
   * broadcast continues.
   */
  start: number;
  end: number;
  /** How far ahead of the playhead is already downloaded. */
  buffered: number;
  disabled?: boolean;
  /** Fires continuously while a finger drags; null when the drag ends. */
  onScrubPreview: (time: number | null) => void;
  /** Fires once, with the position to jump to. */
  onSeek: (time: number) => void;
  /** OK / tap on the bar itself. */
  onPress?: () => void;
  /** Lets the player know left/right should scrub rather than move focus. */
  onFocusChange?: (focused: boolean) => void;
  hasTVPreferredFocus?: boolean;
}

/**
 * The scrub bar, and the one control that has to work three different ways.
 *
 * ---------------------------------------------------------------------------
 * Touch: the bar is dragged directly
 * ---------------------------------------------------------------------------
 * A finger expects to grab the bar and move it, and to be able to tap anywhere
 * on it to jump there. The row it lives in is a full touch target tall (48dp)
 * even though the bar itself is 4dp, because a 4dp drag target is a control that
 * only works for people who do not need it to.
 *
 * ---------------------------------------------------------------------------
 * TV: the bar takes focus, and left/right then scrub
 * ---------------------------------------------------------------------------
 * A remote cannot point at a position, so the bar becomes a focus target and the
 * D-pad drives it. This is why it sits on its own row, with no other focusable
 * beside it: left and right have nowhere else to go, so the focus engine leaves
 * them alone and `VideoPlayer` can spend them on scrubbing (see
 * `useRemoteControl`). Put a button next to the bar and the same key press
 * becomes ambiguous -- which is the bug that makes so many TV players scrub when
 * you were only trying to reach Pause.
 *
 * ---------------------------------------------------------------------------
 * Both: a live stream is not a film
 * ---------------------------------------------------------------------------
 * `start` is not always zero. A live HLS stream with a DVR window is seekable
 * only inside it, and the window slides: the position that was the oldest
 * available frame a minute ago has since expired. Drawing the bar between
 * `start` and `end` rather than 0 and `duration` is what makes the playhead sit
 * at the right edge when watching live, and move left as you fall behind.
 */
export function SeekBar({
  position,
  start,
  end,
  buffered,
  disabled = false,
  onScrubPreview,
  onSeek,
  onPress,
  onFocusChange,
  hasTVPreferredFocus = false,
}: SeekBarProps) {
  const styles = useStyles();
  const metrics = useMetrics();
  const chrome = resolvePlayerChrome(metrics);

  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Measured width of the track, needed to turn an x coordinate into a time. */
  const trackWidth = useRef(0);

  const handleTrackLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidth.current = event.nativeEvent.layout.width;
  }, []);

  /**
   * Live values for the pan responder, which is created once and must not close
   * over a stale window.
   */
  const windowRef = useRef({ start, end });
  windowRef.current = { start, end };

  const callbacksRef = useRef({ onScrubPreview, onSeek, disabled });
  callbacksRef.current = { onScrubPreview, onSeek, disabled };

  const timeAt = useCallback((x: number) => {
    const width = trackWidth.current;
    const { start: from, end: to } = windowRef.current;
    if (width <= 0 || to <= from) {
      return from;
    }
    return clampSeekTarget(from + (x / width) * (to - from), from, to);
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !callbacksRef.current.disabled,
        onMoveShouldSetPanResponder: () => !callbacksRef.current.disabled,
        // The gesture layer under the video would otherwise take over as soon as
        // the drag became horizontal, and a scrub started on the bar would turn
        // into a swipe-seek with a different scale.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (event: GestureResponderEvent) => {
          setDragging(true);
          callbacksRef.current.onScrubPreview(
            timeAt(event.nativeEvent.locationX),
          );
        },

        onPanResponderMove: (event: GestureResponderEvent) => {
          // locationX stays relative to the row for the whole gesture, including
          // after the finger has left it -- it simply goes negative or past the
          // width, which `timeAt` clamps. That is what lets a drag continue when
          // the thumb wanders off the bar, instead of sticking at the edge.
          callbacksRef.current.onScrubPreview(
            timeAt(event.nativeEvent.locationX),
          );
        },

        onPanResponderRelease: (event: GestureResponderEvent) => {
          setDragging(false);
          const target = timeAt(event.nativeEvent.locationX);
          callbacksRef.current.onScrubPreview(null);
          callbacksRef.current.onSeek(target);
        },

        onPanResponderTerminate: () => {
          setDragging(false);
          callbacksRef.current.onScrubPreview(null);
        },
      }),
    [timeAt],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocusChange?.(true);
  }, [onFocusChange]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onFocusChange?.(false);
  }, [onFocusChange]);

  const span = Math.max(end - start, 0);
  const played = span > 0 ? clamp01((position - start) / span) : 0;
  const ahead = span > 0 ? clamp01((buffered - start) / span) : 0;

  const active = focused || dragging;
  const thumbVisible = metrics.isTouch || active;

  const thumbSize = active ? chrome.seekThumb : chrome.seekThumb * 0.75;

  /**
   * Announced identically on both devices, so a screen reader hears one control
   * rather than two implementations of one.
   */
  const a11y = {
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: 'Seek bar',
    accessibilityValue: {
      text: `${formatTime(position - start)} of ${formatTime(span)}`,
    },
  };

  const track = (
    <View style={styles.trackArea} onLayout={handleTrackLayout}>
      <View
        style={[
          styles.track,
          { height: active ? chrome.seekTrackActive : chrome.seekTrack },
        ]}
      >
        {/* Buffered first, so the played fill paints over it. */}
        <View style={[styles.buffered, { width: `${ahead * 100}%` }]} />
        <View
          style={[
            styles.played,
            { width: `${played * 100}%` },
            disabled && styles.playedDisabled,
          ]}
        />
      </View>

      {thumbVisible && !disabled ? (
        <View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
              left: `${played * 100}%`,
              // Centres the thumb on the playhead without measuring the track:
              // the percentage puts its left edge there, this pulls it back by
              // half its own width.
              marginLeft: -thumbSize / 2,
            },
          ]}
        />
      ) : null}
    </View>
  );

  /**
   * The two devices need two different primitives, not one with a branch.
   *
   * `Pressable` cannot be the touch implementation, and this is a trap worth
   * naming: it spreads its OWN responder handlers after the props it is given
   * (see Pressable.js -- `{...restPropsWithDefaults}` then `{...eventHandlers}`),
   * so pan handlers passed to it are silently overridden. The bar would still
   * report taps and would never report a drag, which looks like a broken
   * gesture rather than the wrong component.
   *
   * So: a plain View owns the touch path, where the PanResponder is the whole
   * interaction -- press and release without moving is a tap-to-seek, because
   * grant previews a position and release commits it. Pressable owns the TV
   * path, where what is needed is focus, OK, and no touch handling at all.
   */
  if (metrics.isTV) {
    return (
      <Pressable
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        focusable={!disabled}
        hasTVPreferredFocus={hasTVPreferredFocus}
        {...a11y}
        style={[styles.row, { height: chrome.seekRowHeight }]}
      >
        {track}
      </Pressable>
    );
  }

  return (
    <View
      {...a11y}
      style={[styles.row, { height: chrome.seekRowHeight }]}
      {...(disabled ? null : responder.panHandlers)}
    >
      {track}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    justifyContent: 'center',
    // The row is a touch target, and a touch target with a visible border would
    // draw a 48dp box around a 4dp bar.
    borderWidth: 0,
  },
  trackArea: {
    justifyContent: 'center',
  },
  track: {
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  buffered: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.textMuted,
  },
  played: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
  },
  playedDisabled: {
    backgroundColor: colors.live,
  },
  thumb: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
}));
