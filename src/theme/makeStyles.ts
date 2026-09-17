import {
  StyleSheet,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useMetrics } from './MetricsProvider';
import type { Metrics } from './metrics';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (metrics: Metrics) => T & NamedStyles<any>,
): () => T {
  const cache = new WeakMap<Metrics, T>();

  return function useResolvedStyles(): T {
    const metrics = useMetrics();

    const cached = cache.get(metrics);
    if (cached) {
      return cached;
    }

    const created: T = StyleSheet.create(factory(metrics));
    cache.set(metrics, created);
    return created;
  };
}
