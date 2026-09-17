import { useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
  type PanResponderGestureState,
} from 'react-native';

export type TapZone = 'left' | 'centre' | 'right';
export type DragAxis = 'seek' | 'volume' | 'brightness';

export const GESTURE_SLOP_PX = 12;

export const DOUBLE_TAP_MS = 320;

export const HOLD_MS = 450;

export const SWIPE_SEEK_WINDOW_SECONDS = 120;

const VERTICAL_TRAVEL_FRACTION = 0.6;

const SIDE_ZONE_FRACTION = 0.35;

const PINCH_RATIO_STEP = 1.25;

export function tapZoneFor(x: number, width: number): TapZone {
  if (width <= 0) {
    return 'centre';
  }
  if (x < width * SIDE_ZONE_FRACTION) {
    return 'left';
  }
  if (x > width * (1 - SIDE_ZONE_FRACTION)) {
    return 'right';
  }
  return 'centre';
}

export function dragAxisFor(
  dx: number,
  dy: number,
  startX: number,
  width: number,
): DragAxis {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return 'seek';
  }
  return startX < width / 2 ? 'brightness' : 'volume';
}

export function swipeSeekSeconds(
  dx: number,
  width: number,
  windowSeconds: number = SWIPE_SEEK_WINDOW_SECONDS,
): number {
  if (width <= 0) {
    return 0;
  }
  return (dx / width) * windowSeconds;
}

export function verticalDragFraction(dy: number, height: number): number {
  if (height <= 0) {
    return 0;
  }
  return -dy / (height * VERTICAL_TRAVEL_FRACTION);
}

export interface PlayerGestureHandlers {
  onTap: () => void;
  onDoubleTap: (zone: TapZone) => void;
  onDragStart: (axis: DragAxis) => void;
  onDragMove: (axis: DragAxis, amountFromStart: number) => void;
  onDragEnd: (axis: DragAxis, committed: boolean) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onPinch: (direction: 'in' | 'out') => void;
}

interface GestureState {
  axis: DragAxis | null;
  holding: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  pinchBase: number | null;
  startX: number;
  lastTapAt: number;
  width: number;
  height: number;
}

export function usePlayerGestures(
  handlers: PlayerGestureHandlers,
  {
    enabled,
    seekWindowSeconds = SWIPE_SEEK_WINDOW_SECONDS,
  }: { enabled: boolean; seekWindowSeconds?: number },
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const seekWindowRef = useRef(seekWindowSeconds);
  seekWindowRef.current = seekWindowSeconds;

  const state = useRef<GestureState>({
    axis: null,
    holding: false,
    holdTimer: null,
    pinchBase: null,
    startX: 0,
    lastTapAt: 0,
    width: 0,
    height: 0,
  });

  const responder = useMemo(() => {
    const s = state.current;

    const cancelHold = () => {
      if (s.holdTimer) {
        clearTimeout(s.holdTimer);
        s.holdTimer = null;
      }
    };

    const endHold = () => {
      cancelHold();
      if (s.holding) {
        s.holding = false;
        handlersRef.current.onHoldEnd();
      }
    };

    const abandonDrag = (committed: boolean) => {
      if (s.axis) {
        handlersRef.current.onDragEnd(s.axis, committed);
        s.axis = null;
      }
    };

    const handlePinch = (touches: NativeTouchEvent[]) => {
      const separation = Math.hypot(
        touches[0].pageX - touches[1].pageX,
        touches[0].pageY - touches[1].pageY,
      );

      if (s.pinchBase === null) {
        abandonDrag(false);
        s.pinchBase = separation;
        return;
      }

      const ratio = separation / s.pinchBase;
      if (ratio > PINCH_RATIO_STEP) {
        handlersRef.current.onPinch('in');
        s.pinchBase = separation;
      } else if (ratio < 1 / PINCH_RATIO_STEP) {
        handlersRef.current.onPinch('out');
        s.pinchBase = separation;
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabledRef.current,
      onMoveShouldSetPanResponder: () => enabledRef.current,

      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (event: GestureResponderEvent) => {
        cancelHold();
        s.axis = null;
        s.holding = false;
        s.pinchBase = null;
        s.startX = event.nativeEvent.locationX;

        s.holdTimer = setTimeout(() => {
          s.holdTimer = null;
          s.holding = true;
          handlersRef.current.onHoldStart();
        }, HOLD_MS);
      },

      onPanResponderMove: (
        event: GestureResponderEvent,
        gesture: PanResponderGestureState,
      ) => {
        const touches = event.nativeEvent.touches;

        if (touches.length >= 2) {
          cancelHold();
          handlePinch(touches);
          return;
        }

        if (s.pinchBase !== null) {
          return;
        }

        if (s.holding) {
          return;
        }

        if (s.axis === null) {
          if (
            Math.abs(gesture.dx) < GESTURE_SLOP_PX &&
            Math.abs(gesture.dy) < GESTURE_SLOP_PX
          ) {
            return;
          }
          cancelHold();
          s.axis = dragAxisFor(gesture.dx, gesture.dy, s.startX, s.width);
          handlersRef.current.onDragStart(s.axis);
        }

        handlersRef.current.onDragMove(
          s.axis,
          s.axis === 'seek'
            ? swipeSeekSeconds(gesture.dx, s.width, seekWindowRef.current)
            : verticalDragFraction(gesture.dy, s.height),
        );
      },

      onPanResponderRelease: () => {
        cancelHold();

        if (s.holding) {
          endHold();
          return;
        }

        if (s.pinchBase !== null) {
          s.pinchBase = null;
          return;
        }

        if (s.axis) {
          abandonDrag(true);
          return;
        }

        const now = Date.now();
        const chained = now - s.lastTapAt <= DOUBLE_TAP_MS;
        s.lastTapAt = now;

        if (chained) {
          handlersRef.current.onDoubleTap(tapZoneFor(s.startX, s.width));
        } else {
          handlersRef.current.onTap();
        }
      },

      onPanResponderTerminate: () => {
        endHold();
        abandonDrag(false);
        s.pinchBase = null;
      },
    });
  }, []);

  useEffect(() => {
    const s = state.current;
    return () => {
      if (s.holdTimer) {
        clearTimeout(s.holdTimer);
      }
    };
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    state.current.width = event.nativeEvent.layout.width;
    state.current.height = event.nativeEvent.layout.height;
  };

  return { panHandlers: responder.panHandlers, onLayout };
}
