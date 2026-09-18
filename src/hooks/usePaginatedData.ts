import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { toAppError, type AppError } from '../services/errors';

/**
 * How many pages in a row may add nothing before the feed is treated as spent.
 */
const MAX_EMPTY_PAGES = 2;

export interface Page<T, C> {
  items: T[];

  cursor: C | null;

  done: boolean;
}

export interface PaginatedState<T> {
  items: T[];

  /** First page in flight, with nothing on screen yet. */
  isLoading: boolean;

  /** A further page is in flight below what is already on screen. */
  isLoadingMore: boolean;

  /** Failure of the first page — nothing is on screen. */
  error: AppError | null;

  /** Failure of a further page — what is on screen stays usable. */
  moreError: AppError | null;

  hasMore: boolean;

  loadMore: () => void;

  reload: () => void;
}

/**
 * Drives a cursor-paged list. Holds the accumulated items, tracks the ids
 * already on screen so a page can avoid repeating them, and drops responses
 * that land after a reload.
 */
export function usePaginatedData<T, C>(
  loadPage: (
    cursor: C | null,
    seen: ReadonlySet<string>,
  ) => Promise<Page<T, C>>,
  identify: (item: T) => string,
  deps: unknown[] = [],
): PaginatedState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [moreError, setMoreError] = useState<AppError | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [reloadToken, setReloadToken] = useState(0);

  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  const identifyRef = useRef(identify);
  identifyRef.current = identify;

  const cursor = useRef<C | null>(null);
  const seen = useRef<Set<string>>(new Set());

  /**
   * Bumped on every reload and on every dep change. A response carrying a
   * stale generation is discarded rather than merged into the fresh list.
   */
  const generation = useRef(0);

  /** Held across renders so two loads can never overlap. */
  const inFlight = useRef(false);

  /** Consecutive pages that added nothing, so a dry feed still terminates. */
  const emptyStreak = useRef(0);

  const fetchPage = useCallback(async (first: boolean) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;

    const mine = generation.current;

    if (first) {
      setIsLoading(true);
      setError(null);
    } else {
      setIsLoadingMore(true);
    }
    setMoreError(null);

    try {
      const page = await loadPageRef.current(cursor.current, seen.current);

      if (mine !== generation.current) {
        return;
      }

      const fresh: T[] = [];
      for (const item of page.items) {
        const id = identifyRef.current(item);
        if (seen.current.has(id)) {
          continue;
        }
        seen.current.add(id);
        fresh.push(item);
      }

      cursor.current = page.cursor;

      // A page can come back empty while there is still ground to cover — the
      // loader spends a fixed request budget and a keyword may match nothing.
      // So an empty page is not the end; only the source saying so is, or a
      // run of empty pages, which guards against an endless "load more".
      emptyStreak.current = fresh.length === 0 ? emptyStreak.current + 1 : 0;

      setHasMore(
        !page.done &&
          page.cursor !== null &&
          emptyStreak.current < MAX_EMPTY_PAGES,
      );

      setItems(current => (first ? fresh : [...current, ...fresh]));
    } catch (caught) {
      if (mine !== generation.current) {
        return;
      }

      const failure = toAppError(caught);
      if (first) {
        setError(failure);
      } else {
        setMoreError(failure);
      }
    } finally {
      if (mine === generation.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
      inFlight.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    if (inFlight.current || !hasMore) {
      return;
    }
    fetchPage(false);
  }, [fetchPage, hasMore]);

  const reload = useCallback(() => {
    setReloadToken(token => token + 1);
  }, []);

  useEffect(() => {
    generation.current += 1;

    cursor.current = null;
    seen.current = new Set();
    inFlight.current = false;
    emptyStreak.current = 0;

    // The list is deliberately left in place: the first page replaces it when
    // it lands, so a refresh keeps the grid on screen instead of flashing the
    // skeleton over it.
    setHasMore(true);
    setMoreError(null);

    fetchPage(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, reloadToken, ...deps]);

  const retryMore = useCallback(() => {
    setMoreError(null);
    emptyStreak.current = 0;
    fetchPage(false);
  }, [fetchPage]);

  return useMemo(
    () => ({
      items,
      isLoading,
      isLoadingMore,
      error,
      moreError,
      hasMore,
      loadMore: moreError === null ? loadMore : retryMore,
      reload,
    }),
    [
      error,
      hasMore,
      isLoading,
      isLoadingMore,
      items,
      loadMore,
      moreError,
      reload,
      retryMore,
    ],
  );
}
