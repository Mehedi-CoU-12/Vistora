import { useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeTouchEvent,
  type PanResponderGestureState,
} from 'react-native';

/**
 * ===========================================================================
 * The touch layer: one PanResponder that recognises six gestures.
 * ===========================================================================
 * On a phone the video surface *is* the control surface. These are the gestures
 * every mature mobile player has converged on, and the reason they can all live
 * on the same square of screen is that each one is distinguishable from the
 * others within the first ~12dp of movement or the first ~450ms of contact:
 *
 *   tap                 show / hide the controls
 *   double-tap left     skip back    (repeat to accumulate: -10s, -20s, -30s)
 *   double-tap right    skip forward
 *   double-tap centre   play / pause
 *   swipe horizontally  scrub, with a live preview, committed on release
 *   swipe vertically    volume on the right half, brightness on the left
 *   press and hold      temporary 2x speed while held
 *   pinch               cycle how the picture is fitted to the screen
 *
 * ---------------------------------------------------------------------------
 * Why one responder and not several nested ones
 * ---------------------------------------------------------------------------
 * A gesture is claimed by exactly one responder, and the claim is made *before*
 * anyone knows what the gesture will turn out to be. Two overlapping responders
 * -- one for taps, one for drags -- means whichever claims first wins, and the
 * other never fires: the classic symptom is a double-tap that works only when
 * your thumb is perfectly still. So a single responder takes every touch and
 * decides afterwards, which is also why the thresholds below are the whole
 * design and not incidental constants.
 *
 * ---------------------------------------------------------------------------
 * Why this is not used on a TV
 * ---------------------------------------------------------------------------
 * A TV has no touchscreen, and mounting a full-screen responder over the video
 * would make the surface a touch target for nothing while adding a view the
 * focus engine has to reason about. `VideoPlayer` renders the gesture layer only
 * on a touch device; on TV the remote handler in `useRemoteControl` covers the
 * same actions.
 */

export type TapZone = 'left' | 'centre' | 'right';
export type DragAxis = 'seek' | 'volume' | 'brightness';

/**
 * Movement, in dp, before a contact counts as a drag rather than a tap.
 *
 * Small enough that a deliberate swipe is recognised immediately, large enough
 * that a thumb rolling on the glass during a tap is not a 3-second scrub.
 */
export const GESTURE_SLOP_PX = 12;

/** Gap between two taps that still reads as one double-tap. */
export const DOUBLE_TAP_MS = 320;

/** Contact time before a still finger becomes the speed-boost hold. */
export const HOLD_MS = 450;

/**
 * Seconds of timeline covered by a swipe across the full width of the screen.
 *
 * Fixed rather than proportional to the duration, which is the interesting
 * choice. Mapping the whole film to the screen width sounds natural and is
 * horrible in practice: on a two-hour film every dp is nine seconds, so nothing
 * finer than "somewhere in that chapter" can be expressed, and on a 30-second
 * clip the same swipe cannot move at all. A fixed window means the gesture has
 * one feel -- about a minute either way -- on every piece of content, and the
 * scrub bar remains the tool for crossing a whole film.
 */
export const SWIPE_SEEK_WINDOW_SECONDS = 120;

/**
 * Fraction of the screen height a vertical swipe needs to travel to go from 0%
 * to 100%. Less than the full height so the gesture is comfortable one-handed,
 * with the thumb never leaving the lower half.
 */
const VERTICAL_TRAVEL_FRACTION = 0.6;

/** Width of each double-tap side zone, as a fraction of the screen. */
const SIDE_ZONE_FRACTION = 0.35;

/** How far apart two fingers must move before the pinch changes the fit mode. */
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

/**
 * Which axis a drag belongs to.
 *
 * The dominant axis decides seek versus level, and then the *starting* x decides
 * which level. Starting x rather than current x, so a vertical swipe that drifts
 * across the middle of the screen does not switch from brightness to volume
 * halfway through.
 */
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

/** Horizontal travel -> seconds, signed. */
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

/** Vertical travel -> a signed fraction, positive when the finger moves up. */
export function verticalDragFraction(dy: number, height: number): number {
  if (height <= 0) {
    return 0;
  }
  return -dy / (height * VERTICAL_TRAVEL_FRACTION);
}

/**
 * What the player does with each recognised gesture.
 *
 * `onDragMove` reports the amount measured from where the drag STARTED, not
 * since the last event: seconds for `seek`, a signed 0..1 fraction for the two
 * levels. The player therefore captures the value it is adjusting in
 * `onDragStart` and adds this to it, which keeps the gesture stable if a move
 * event is dropped and means no error can accumulate over a long drag.
 */
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
  { enabled }: { enabled: boolean },
) {
  /**
   * Both of these are refs rather than dependencies because the PanResponder is
   * created once, on mount. Rebuilding it when a callback identity changes would
   * drop a gesture already in flight -- and `enabled` changes precisely when the
   * user hits the lock button, which is mid-interaction by definition.
   */
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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
        // A second finger arrived. Whatever the first one was doing is not what
        // the user means any more.
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
      // Claim every touch that reaches this layer. Controls are rendered ABOVE
      // it, so a press on a button never gets here in the first place -- see the
      // layer order in VideoPlayer.
      onStartShouldSetPanResponder: () => enabledRef.current,
      onMoveShouldSetPanResponder: () => enabledRef.current,
      // Nothing above this view has a better claim on a touch that started on
      // the video, and yielding mid-scrub would freeze the preview on screen.
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

        // Once a pinch has started, stay in it until every finger is up. A pinch
        // almost always ends with one finger lifting first, and treating the
        // survivor's travel as a scrub would jump the position on release.
        if (s.pinchBase !== null) {
          return;
        }

        // While the speed boost is held, movement is just an unsteady thumb.
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
            ? swipeSeekSeconds(gesture.dx, s.width)
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

        // No drag, no hold, no pinch: a tap. A tap that follows another within
        // DOUBLE_TAP_MS is the second of a pair -- and so is a third, and a
        // fourth, which is what makes repeated skipping work.
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

  /**
   * The gesture maths needs the size of the surface, and a PanResponder is never
   * told it. So the layer reports its own size and the caller must spread this
   * alongside the handlers -- without it, every gesture measures against a width
   * of zero and nothing responds.
   */
  const onLayout = (event: LayoutChangeEvent) => {
    state.current.width = event.nativeEvent.layout.width;
    state.current.height = event.nativeEvent.layout.height;
  };

  return { panHandlers: responder.panHandlers, onLayout };
}
