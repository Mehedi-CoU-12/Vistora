import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {SplashOverlay} from './src/components/SplashOverlay';
import {RootNavigator} from './src/navigation/RootNavigator';
import {MetricsProvider} from './src/theme';

/**
 * Vistora -- a media app for Android TV and Android phones/tablets.
 *
 * The whole architecture in one paragraph: screens ask `contentService` for
 * data, which asks Supabase over HTTPS and returns app models. When the user
 * selects something, the resulting `stream_url` is handed to `VideoPlayer`,
 * which gives it to Media3/ExoPlayer, which opens its own connection to the
 * CDN. Supabase serves metadata; it never carries video.
 *
 * The two providers wrapping the navigator are the whole of the app's responsive
 * setup, and they are ordered deliberately:
 *
 *   SafeAreaProvider  measures the real system insets -- status bar, navigation
 *                     bar, display cutout. All zero on a TV, which has no system
 *                     bars; the numbers that matter on a phone.
 *   MetricsProvider   resolves the window size into layout metrics (device
 *                     class, orientation, card sizes, grid columns, type scale)
 *                     and re-resolves them on rotation.
 *
 * Everything below reads those through `useSafeAreaInsets()` and `useMetrics()`
 * rather than measuring the screen itself.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <MetricsProvider>
        {/* The wrapper exists to give SplashOverlay a full-screen positioned
            parent: MetricsProvider renders a context provider, not a host view,
            so an absolutely-positioned child has nothing to fill. */}
        <View style={styles.root}>
          <RootNavigator />
          {/* Last child, so it paints over the navigator while the app settles.
              Unmounts itself once faded; see SplashOverlay for why the splash
              needs a JS half at all. */}
          <SplashOverlay />
        </View>
      </MetricsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
