import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';

import { colors, makeStyles, radius, useMetrics } from '../theme';
import { formatTime } from './formatTime';
import { clamp01, timeForTrackX } from './playbackOptions';
import { resolvePlayerChrome } from './playerLayout';

interface SeekBarProps {
  position: number;

  start: number;
  end: number;

  buffered: number;
  disabled?: boolean;

  onScrubPreview: (time: number | null) => void;

  onSeek: (time: number) => void;

  onPress?: () => void;

  onFocusChange?: (focused: boolean) => void;
  hasTVPreferredFocus?: boolean;
}

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

  const trackRef = useRef<View>(null);
  const geometry = useRef({ pageX: 0, width: 0 });

  const measureTrack = useCallback(() => {
    trackRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (width > 0) {
        geometry.current = { pageX, width };
      }
    });
  }, []);

  const windowRef = useRef({ start, end });
  windowRef.current = { start, end };

  const callbacksRef = useRef({ onScrubPreview, onSeek, disabled });
  callbacksRef.current = { onScrubPreview, onSeek, disabled };

  const timeAtWindowX = useCallback(
    (windowX: number): number | null =>
      timeForTrackX(windowX, geometry.current, windowRef.current),
    [],
  );

  const lastWindowX = useRef(0);

  const preview = useCallback(
    (windowX: number) => {
      const target = timeAtWindowX(windowX);
      if (target !== null) {
        callbacksRef.current.onScrubPreview(target);
      }
    },
    [timeAtWindowX],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !callbacksRef.current.disabled,
        onMoveShouldSetPanResponder: () => !callbacksRef.current.disabled,

        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (event: GestureResponderEvent) => {
          measureTrack();
          setDragging(true);
          lastWindowX.current = event.nativeEvent.pageX;
          preview(lastWindowX.current);
        },

        onPanResponderMove: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          lastWindowX.current = gesture.moveX;
          preview(gesture.moveX);
        },

        onPanResponderRelease: () => {
          setDragging(false);

          const target = timeAtWindowX(lastWindowX.current);
          callbacksRef.current.onScrubPreview(null);
          if (target !== null) {
            callbacksRef.current.onSeek(target);
          }
        },

        onPanResponderTerminate: () => {
          setDragging(false);
          callbacksRef.current.onScrubPreview(null);
        },
      }),
    [measureTrack, preview, timeAtWindowX],
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

  const a11y = {
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: 'Seek bar',
    accessibilityValue: {
      text: `${formatTime(position - start)} of ${formatTime(span)}`,
    },
  };

  const track = (
    <View
      ref={trackRef}
      style={styles.trackArea}
      onLayout={measureTrack}
      pointerEvents="none"
    >
      <View
        style={[
          styles.track,
          { height: active ? chrome.seekTrackActive : chrome.seekTrack },
        ]}
      >
        {}
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

              marginLeft: -thumbSize / 2,
            },
          ]}
        />
      ) : null}
    </View>
  );

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
