import { useSyncExternalStore } from 'react';

/**
 * ===========================================================================
 * Everything under src/state/ is DELIBERATELY EPHEMERAL. Read this first.
 * ===========================================================================
 *
 * The app has no accounts, no sign-in and no user table, which means it has
 * nowhere to durably keep "things this person saved" or "where this person got
 * to". Two surfaces in the redesigned UI want exactly that -- a My List button
 * and a Continue Watching rail -- and there are three ways to handle the gap:
 *
 *   1. Ship neither, and leave two holes in the design.
 *   2. Fake it with hard-coded rows, so the rail shows titles nobody watched.
 *   3. Keep it in memory for the lifetime of the process, honestly.
 *
 * This is (3), and the distinction from (2) matters: nothing here is invented.
 * Continue Watching lists what you actually started playing, in this session;
 * My List holds what you actually added, in this session. Both are empty on a
 * cold start, and every surface that reads them renders nothing at all when they
 * are -- which is the correct behaviour for a new viewer either way, and is why
 * the UI does not have to change when persistence lands.
 *
 * ---------------------------------------------------------------------------
 * What replacing this with real persistence looks like
 * ---------------------------------------------------------------------------
 * Swap the `Map` inside each store for a table read, keep the same module
 * surface, and no screen changes. That is the entire point of putting it behind
 * these four functions rather than behind a Context that screens destructure:
 * the boundary is already where the network call will go.
 *
 * Nothing in here touches Supabase, AsyncStorage or the filesystem. On purpose:
 * a half-implemented persistence layer is harder to replace than none.
 */

/** A store's listener set plus its current value. */
export interface Store<T> {
  /** The current value. Referentially stable until something writes. */
  get: () => T;
  /** Replaces the value and notifies subscribers. */
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * The smallest observable value that `useSyncExternalStore` can read.
 *
 * An external store rather than a React Context because these are written from
 * places that are not components -- `useOpenItem` records a play as it
 * navigates -- and because a Context holding a Map would re-render every card on
 * every screen each time one item was added to a list. Subscribers here are the
 * two or three components that actually display the state.
 *
 * The snapshot MUST be referentially stable between writes: `useSyncExternalStore`
 * calls `get` on every render and re-renders if the result differs by identity, so
 * returning a fresh array each time is an infinite loop. Every store below
 * therefore keeps one frozen snapshot and rebuilds it only inside `set`.
 */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set: next => {
      if (Object.is(next, value)) {
        return;
      }
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribes a component to a store. Re-renders only when the value changes. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
