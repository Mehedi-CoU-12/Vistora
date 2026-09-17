import type { ContentItem } from '../types/content';
import { createStore, useStore } from './store';












const store = createStore<readonly ContentItem[]>([]);


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









export function useIsInMyList(id: string): boolean {
  return useStore(store).some(entry => entry.id === id);
}

export function useMyList(): readonly ContentItem[] {
  return useStore(store);
}
