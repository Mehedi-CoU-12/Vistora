import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

/** Appearing is the faster half: the user asked for it and is waiting. */
const FADE_IN_MS = 140;

/**
 * Leaving is slower, because nobody asked for it.
 *
 * The controls auto-hide four seconds after the last input, which means the
 * viewer is usually looking at the picture rather than at the buttons when they
 * go. A quick fade there registers as a flicker at the edge of vision -- the eye
 * catches the change and not what changed -- while a slower one is simply not
 * noticed, which is the goal.
 */
const FADE_OUT_MS = 260;

export interface OverlayFade {
  /** Whether the overlay should be in the tree at all. */
  mounted: boolean;
  opacity: Animated.Value;
}

/**
 * Fades the control overlay in and out instead of cutting it.
 *
 * ---------------------------------------------------------------------------
 * Why a hook, when it is one Animated.Value
 * ---------------------------------------------------------------------------
 * Because the interesting part is not the animation, it is that fading *out*
 * requires the thing to stay mounted after it has logically gone. Rendering on
 * `visible` alone unmounts the overlay on the frame it is dismissed, so the
 * fade-out plays to nobody -- the classic version of this bug, where the
 * appearing animation works and the disappearing one silently does not.
 *
 * So `mounted` lags `visible` by the length of the fade, and the caller renders
 * on `mounted` while animating on `opacity`.
 *
 * ---------------------------------------------------------------------------
 * `animateOut` is false on a TV, and that is not an oversight
 * ---------------------------------------------------------------------------
 * On a TV the overlay owns D-pad focus, and a control that is fading out is
 * still a control the focus engine can see: for the quarter second it lingers,
 * the remote can reach a button on its way off the screen and press it. Worse,
 * the invisible focus-holding layer `VideoPlayer` mounts when the controls hide
 * (the one thing that lets the overlay be recovered at all -- see the note on
 * `wakeLayer`) would be competing for focus with the overlay it replaced.
 *
 * Fading in has no such problem: the overlay is mounted and focusable for the
 * whole animation, which is exactly what it should be. So a TV gets the fade in
 * and an instant cut out, and a phone -- which has no focus to lose -- gets
 * both. That asymmetry is cheaper than making focus correct during a transition
 * nobody watching a TV from three metres away would notice.
 */
export function useOverlayFade(
  visible: boolean,
  animateOut: boolean,
): OverlayFade {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!animateOut) {
      opacity.setValue(0);
      setMounted(false);
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // `finished` is false when a new animation took the value over, which is
      // what happens if the overlay is asked back mid-fade -- a tap while it is
      // on its way out. Unmounting there would drop an overlay that is at that
      // moment animating back to full opacity.
      if (finished) {
        setMounted(false);
      }
    });
  }, [animateOut, opacity, visible]);

  return { mounted, opacity };
}
