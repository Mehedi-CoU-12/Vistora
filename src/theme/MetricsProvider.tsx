import React, {createContext, useContext, useMemo} from 'react';
import {Dimensions, useWindowDimensions} from 'react-native';

import {resolveMetrics, type Metrics} from './metrics';

/**
 * The one snapshot of `Dimensions` in the app, and only as a fallback.
 *
 * `createContext` needs a value eagerly, so this covers a `useMetrics()` call
 * with no provider above it -- a unit test, or a component rendered in
 * isolation. In the app the provider always wins, and the provider's value comes
 * from `useWindowDimensions()`, which updates on rotation. This constant is
 * allowed to be stale precisely because nothing rendering on screen reads it.
 */
const initialWindow = Dimensions.get('window');

const MetricsContext = createContext<Metrics>(
  resolveMetrics(initialWindow.width, initialWindow.height),
);

/**
 * Resolves the window size into layout metrics once per size change, and shares
 * the result with the whole tree.
 *
 * Why a provider rather than each component calling `useWindowDimensions()`
 * itself: the metrics object is then referentially stable between rotations,
 * which is what lets `makeStyles` cache a built StyleSheet against it. Resolving
 * per component would hand every consumer a fresh object on every render and
 * rebuild every StyleSheet with it.
 *
 * Rotation reaches here without the activity being recreated, because
 * `android:configChanges` in AndroidManifest.xml lists `orientation`,
 * `screenSize`, `screenLayout` and `smallestScreenSize`. React Native turns the
 * configuration change into a dimensions event, so the tree re-renders with new
 * metrics rather than remounting -- which also means navigation state, scroll
 * offsets and playback survive a turn of the phone.
 */
export function MetricsProvider({children}: {children: React.ReactNode}) {
  const {width, height} = useWindowDimensions();

  const metrics = useMemo(() => resolveMetrics(width, height), [width, height]);

  return <MetricsContext.Provider value={metrics}>{children}</MetricsContext.Provider>;
}

export function useMetrics(): Metrics {
  return useContext(MetricsContext);
}
