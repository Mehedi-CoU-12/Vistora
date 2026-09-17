import { createStore, useStore } from './store';

/**
 * Whether a press of Play is currently waiting on a URL, and for what.
 *
 * ---------------------------------------------------------------------------
 * Not user data, unlike everything else in this folder
 * ---------------------------------------------------------------------------
 * The header of store.ts is about My List and Continue Watching -- things a
 * viewer accumulates, held in memory because there is nowhere to persist them.
 * This is not one of those. It is transient UI state that is meaningless a
 * second after it is written, and it lives here only because `createStore` is
 * the right primitive for it and lives here.
 *
 * ---------------------------------------------------------------------------
 * Why a store, rather than state in the screen that owns the button
 * ---------------------------------------------------------------------------
 * Play is pressed from four screens -- Home, Catalog, Details and an episode row
 * on Series -- through one hook, `usePlayItem`, whose entire public surface is a
 * callback of type `(item) => void`. Resolution is now asynchronous, so
 * something has to render a spinner during it.
 *
 * Returning `{play, isResolving}` from the hook instead would have been the
 * conventional answer, and it would have changed that signature at all four
 * call sites plus `HeroBanner` and `RailList`, every one of them only to thread
 * a boolean to a spinner none of them draws. Worse, the spinner is a full-screen
 * scrim, so each screen would have had to mount its own copy of the same
 * overlay and they would have drifted.
 *
 * One store, one overlay mounted once above the navigator, and `usePlayItem`
 * keeps the exact signature it had before the refactor. No screen needed
 * editing, which is the strongest evidence the seam is in the right place.
 *
 * ---------------------------------------------------------------------------
 * `begin` is also the double-press guard
 * ---------------------------------------------------------------------------
 * A TV remote produces repeated OK presses routinely -- it is what a viewer does
 * when a screen does not react within a few hundred milliseconds, which is
 * exactly the window resolution now occupies. Without a guard, three presses are
 * three resolutions and three `navigate('Player')` calls, leaving two dead
 * player routes stacked under the live one for Back to walk through.
 *
 * So `begin` reports whether it actually started, and returns false if a
 * resolution is already in flight. Making it the store's answer rather than a
 * ref inside the hook is deliberate: the guard is about the app being busy, not
 * about one component instance, and the overlay blocks input for the same
 * reason.
 */

export interface ResolutionState {
  isResolving: boolean;
  /** What is being resolved, so the overlay can name it. Null when idle. */
  title: string | null;
}

const IDLE: ResolutionState = { isResolving: false, title: null };

const store = createStore<ResolutionState>(IDLE);

/**
 * Marks a resolution as started, unless one already is.
 *
 * Returns false when a press should be dropped -- see the note above. Callers
 * must treat a false as "do nothing at all", not as "carry on without the
 * spinner".
 */
export function beginResolving(title: string): boolean {
  if (store.get().isResolving) {
    return false;
  }

  store.set({ isResolving: true, title });
  return true;
}

/**
 * Marks it finished, however it finished.
 *
 * Call this from a `finally`. A resolution that throws and leaves the flag set
 * would leave a modal spinner over the app with no way back, which is a worse
 * outcome than any error it could have been reporting.
 */
export function endResolving(): void {
  store.set(IDLE);
}

export function useResolutionState(): ResolutionState {
  return useStore(store);
}
