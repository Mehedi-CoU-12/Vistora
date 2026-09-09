import {StyleSheet, type ImageStyle, type TextStyle, type ViewStyle} from 'react-native';

import {useMetrics} from './MetricsProvider';
import type {Metrics} from './metrics';

/**
 * Mirrors the (unexported) constraint on `StyleSheet.create`. The `any` in the
 * signature below is React Native's own -- matching it exactly is what lets a
 * factory's return type flow through to the hook's callers unchanged, so
 * `styles.someTypo` is still a compile error.
 */
type NamedStyles<T> = {[P in keyof T]: ViewStyle | TextStyle | ImageStyle};

/**
 * Builds a component's StyleSheet from the current layout metrics.
 *
 * Usage mirrors `StyleSheet.create`, one level deeper:
 *
 *     const useStyles = makeStyles(m => ({
 *       row: {paddingHorizontal: m.gutter.horizontal},
 *     }));
 *
 *     function Row() {
 *       const styles = useStyles();
 *       ...
 *     }
 *
 * This exists because `StyleSheet.create` at module scope cannot see the screen.
 * The alternatives are worse: inline style objects lose the sheet entirely and
 * allocate on every render, and a `useMemo` per component rebuilds the same
 * sheet once per mounted instance -- forty cards on a screen, forty identical
 * sheets.
 *
 * The WeakMap is keyed on the metrics object, which the provider keeps
 * referentially stable, so the factory runs once per component per window size
 * no matter how many instances mount. Keying weakly means the entry for the old
 * size is collectable as soon as the rotation is over.
 */
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
