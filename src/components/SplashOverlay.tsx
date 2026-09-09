import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

import { colors } from '../theme';

/**
 * The second half of the launch splash.
 *
 * Startup has two distinct waits, and neither mechanism can cover both:
 *
 *   1. Tap -> React paints. Covered natively by SplashTheme's window background
 *      (see res/drawable/splash_screen.xml), because that is the only thing
 *      Android can draw before any of our code runs.
 *   2. React paints -> the UI is worth looking at. Covered here. The moment the
 *      JS root view paints it hides the native window background, so without
 *      this the logo would be replaced by an empty screen or a spinner.
 *
 * The handoff is invisible because both halves draw the same artwork, at the same
 * size, centred on the same colour. Keep `LOGO_BOX` in step with SPLASH_LOGO_DP in
 * scripts/generate-android-icons.py, and the background in step with
 * @color/background, or the seam becomes visible as a jump or a flash.
 */

/** How long the logo holds at full opacity once React has painted. */
const HOLD_MS = 900;
/** Fade duration. Long enough to read as intentional, short enough not to nag. */
const FADE_MS = 400;
/**
 * The box the lock-up is fitted into, in dp. `contain` does the rest, so this
 * needs no knowledge of the artwork's aspect ratio.
 */
const LOGO_BOX = { width: 240, height: 200 } as const;

export function SplashOverlay() {
  const opacity = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Unmount rather than leave a transparent full-screen view in the tree,
        // where it would still cost a layout pass on every render.
        if (finished) {
          setHidden(true);
        }
      });
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, [opacity]);

  if (hidden) {
    return null;
  }

  return (
    // pointerEvents="none" matters less on TV than the fact that this View is not
    // focusable: D-pad focus goes straight to the screen underneath, so the first
    // remote press already lands somewhere useful even mid-fade.
    <Animated.View pointerEvents="none" style={[styles.root, { opacity }]}>
      <Image
        source={require('../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
        // Decorative: the app name is announced by the screen behind this.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    // Spelled out rather than StyleSheet.absoluteFillObject: this React Native
    // version's types only declare `absoluteFill` (a registered style ID), which
    // cannot be spread into a style object.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  logo: LOGO_BOX,
});
