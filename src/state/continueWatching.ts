import type { ContentItem } from '../types/content';
import { createStore, useStore } from './store';

/**
 * Continue Watching, for this session only. See the header of state/store.ts.
 *
 * ---------------------------------------------------------------------------
 * What goes on the rail, and what deliberately does not
 * ---------------------------------------------------------------------------
 * An entry is recorded when playback is actually STARTED -- not when a details
 * screen is opened, and not when a card is focused. That is the difference
 * between a rail that means something and a rail that is a browsing history.
 *
 * Live channels are excluded outright. "Continue" implies a position to return
 * to, and a broadcast has none: the thing that was on when you left is not the
 * thing that is on now, so a channel on this rail would be an invitation to
 * resume something that no longer exists. Channels get their own treatment on
 * the Live TV screen instead.
 *
 * ---------------------------------------------------------------------------
 * There is no progress percentage yet, and the rail does not pretend otherwise
 * ---------------------------------------------------------------------------
 * A real Continue Watching rail draws a progress bar under each card. Doing that
 * needs the player to report a position and something to write it to, which is
 * the persistence work this redesign is explicitly not doing. `progress` is
 * therefore optional on the entry and currently never set, and `ContentCard`
 * draws the bar only when it IS set -- so the day a position arrives, the bar
 * appears with no change to the card. Showing an invented 40% in the meantime
 * would be the one thing on this screen that lies.
 */

export interface WatchEntry {
  item: ContentItem;
  /** When it was started, so the rail can order by most recent. */
  startedAt: number;
  /**
   * Fraction watched, 0..1. Always undefined today -- see the note above.
   * Wired through so that adding playback reporting later is a one-line change
   * here rather than a change to every surface that renders a card.
   */
  progress?: number;
}

/** How many entries the rail keeps. Beyond this it stops being "continue". */
const MAX_ENTRIES = 12;

const store = createStore<readonly WatchEntry[]>([]);

/**
 * Records that something was played. Safe to call from anywhere, including a
 * navigation callback.
 *
 * Re-playing an existing entry moves it to the front rather than adding a
 * duplicate, which is what makes the rail an ordered set rather than a log.
 */
export function recordPlayback(item: ContentItem): void {
  // A live broadcast has no position to return to. See the note above.
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
