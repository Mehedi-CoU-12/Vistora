import { useCallback, useEffect, useRef, useState } from 'react';

import { toAppError, type AppError } from '../services/errors';

export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: AppError | null;

  reload: () => void;
}

export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  const loadRef = useRef(load);
  loadRef.current = load;

  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
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
  }, [reloadToken, ...deps]);

  return { data, isLoading, error, reload };
}
