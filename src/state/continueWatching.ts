import type { ContentItem } from '../types/content';
import { createStore, useStore } from './store';





























export interface WatchEntry {
  item: ContentItem;
  
  startedAt: number;
  




  progress?: number;
}


const MAX_ENTRIES = 12;

const store = createStore<readonly WatchEntry[]>([]);








export function recordPlayback(item: ContentItem): void {
  
  if (item.stream?.isLive || item.kind === 'channel') {
    return;
  }

  const current = store.get();
  const previous = current.find(entry => entry.item.id === item.id);

  store.set(
    [
      {
        item,
        startedAt: Date.now(),
        progress: previous?.progress,
      },
      ...current.filter(entry => entry.item.id !== item.id),
    ].slice(0, MAX_ENTRIES),
  );
}

export function useContinueWatching(): readonly WatchEntry[] {
  return useStore(store);
}
