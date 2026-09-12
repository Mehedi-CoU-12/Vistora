import type { ContentItem } from '../types/content';
import { createStore, useStore } from './store';

/**
 * "My List", for this session only. See the header of state/store.ts for why
 * that is the honest shape of this feature right now.
 *
 * The list is an ordered array rather than a Set of ids, because the rail that
 * displays it needs the items themselves and the app has no other cache to look
 * them up in. Most-recently-added first, which is the order that makes the
 * button feel like it did something: add a film and it is the first card on the
 * rail.
 */

const store = createStore<readonly ContentItem[]>([]);

/** Adds an item, or removes it if it is already there. Returns the new state. */
export function toggleMyList(item: ContentItem): boolean {
  const current = store.get();
  const existing = current.findIndex(entry => entry.id === item.id);

  if (existing >= 0) {
    store.set(current.filter(entry => entry.id !== item.id));
    return false;
  }

  store.set([item, ...current]);
  return true;
}

/**
 * Whether an item is on the list, as a subscription.
 *
 * A hook per item rather than one hook returning the whole list, so a card that
 * shows a tick re-renders when ITS item is toggled and not when any item is. The
 * cost is one subscription per mounted button, which is one or two on a screen --
 * the hero's and the details screen's.
 */
export function useIsInMyList(id: string): boolean {
  return useStore(store).some(entry => entry.id === id);
}

export function useMyList(): readonly ContentItem[] {
  return useStore(store);
}
