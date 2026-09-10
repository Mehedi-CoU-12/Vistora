import { useCallback, useEffect, useRef, useState } from 'react';

import { toAppError, type AppError } from '../services/errors';

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: AppError | null;
  /** Re-runs the loader. Safe to wire straight to a Retry button. */
  reload: () => void;
}

/**
 * Runs an async loader and exposes the three states every screen has to render:
 * loading, error, and data. Deliberately not a caching library -- there is no
 * stale-while-revalidate, no deduplication, no global store. Add React Query
 * later if the app grows to need it; for a handful of screens that would be
 * more machinery than it saves.
 *
 * Pass `deps` the values the loader closes over, exactly like useEffect. The
 * loader itself is intentionally NOT a dependency, so you can define it inline
 * without causing an infinite refetch loop.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  // Keeps the latest loader without making it a dependency.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Incremented by reload() to re-trigger the effect.
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    // Guards against a slow first request resolving after a faster second one
    // and overwriting it, and against setting state on an unmounted screen.
    let active = true;

    setIsLoading(true);
    setError(null);

    loadRef
      .current()
      .then(result => {
        if (active) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(toAppError(caught));
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, ...deps]);

  return { data, isLoading, error, reload };
}
