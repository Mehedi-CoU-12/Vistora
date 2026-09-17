import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

const FADE_IN_MS = 140;

const FADE_OUT_MS = 260;

export interface OverlayFade {
  mounted: boolean;
  opacity: Animated.Value;
}

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
      if (finished) {
        setMounted(false);
      }
    });
  }, [animateOut, opacity, visible]);

  return { mounted, opacity };
}
