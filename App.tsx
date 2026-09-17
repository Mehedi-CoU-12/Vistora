import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from './src/navigation/RootNavigator';
import { installStreamSources } from './src/services/sources';
import { MetricsProvider } from './src/theme';

/**
 * Turns the stream sources on, once, as this module is first imported.
 *
 * Module scope rather than an effect: resolution is driven by a press, which
 * cannot happen before the first render, so there is nothing an effect would
 * order correctly that this does not -- and an effect would re-run the
 * registration on every remount of the root. `installStreamSources` replaces by
 * id, so a Fast Refresh that re-runs this cannot accumulate duplicates.
 */
installStreamSources();

/**
 * Vistora -- a media app for Android TV and Android phones/tablets.
 *
 * The whole architecture in one paragraph: screens ask `contentService` for
 * data, which asks Supabase over HTTPS and returns app models. When the user
 * presses Play, `usePlayItem` asks `streamResolver` where the title can actually
 * be watched right now; the ranked answer is handed to `VideoPlayer`, which
 * gives the first candidate to Media3/ExoPlayer and falls through to the next if
 * it will not open. ExoPlayer opens its own connection to the CDN. Supabase
 * serves metadata; it never carries video.
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
 *
 * There is deliberately no splash component here. The launch splash is entirely
 * native -- the platform's on API 31+, a window background below it, both drawing
 * the same icon -- because a JS splash cannot start until the bundle has loaded,
 * which is the wait it would exist to cover. A JS logo on top of a native one is
 * the same logo appearing twice; see res/drawable/splash_screen.xml.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <MetricsProvider>
        <RootNavigator />
      </MetricsProvider>
    </SafeAreaProvider>
  );
}
