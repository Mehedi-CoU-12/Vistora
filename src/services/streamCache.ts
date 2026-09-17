/**
 * A small time-to-live cache, for answers that are correct now and wrong later.
 *
 * ---------------------------------------------------------------------------
 * Why resolution needs a cache at all, when nothing else in the app has one
 * ---------------------------------------------------------------------------
 * `useAsyncData` says in its own header that it is deliberately not a caching
 * library, and that is still right for catalogue reads: a grid of films is
 * cheap, and a stale one is merely old. Stream resolution is neither. It is a
 * network round trip on the press of Play -- the one moment in the app where
 * latency is felt as a stall in front of a black screen -- and the same item
 * gets resolved repeatedly in normal use: play, press Back, play again; or a
 * mirror dies and the next press asks the same question.
 *
 * So this exists for exactly one caller, and its shape is chosen for that
 * caller rather than for generality.
 *
 * ---------------------------------------------------------------------------
 * Why entries EXPIRE rather than just being evicted
 * ---------------------------------------------------------------------------
 * An LRU alone would be wrong here, and the difference matters. Resolved URLs
 * are frequently signed and time-limited -- a token in the query string, an
 * expiry a few minutes out -- so a cached answer is not merely stale, it stops
 * working. Caching one for the lifetime of the process would turn a working
 * source into a source that plays once and then 403s for as long as the app is
 * open, which is a far more confusing bug than no cache at all.
 *
 * A TTL is therefore the primary mechanism and the entry cap is the secondary
 * one: the clock decides whether an answer is still true, and the cap only
 * stops an long browsing session from growing the map without bound.
 *
 * ---------------------------------------------------------------------------
 * In memory, for this process, like everything else in this app
 * ---------------------------------------------------------------------------
 * Nothing here touches AsyncStorage or the filesystem, for the same reason
 * `src/state/` does not: a resolved URL that outlives the process is a URL that
 * has almost certainly expired by the time it is read back, so persisting it
 * would buy a cold-start hit rate of approximately zero in exchange for a cache
 * invalidation problem.
 */

interface Entry<T> {
  value: T;
  /** Epoch milliseconds. Compared against `now()`, never against a duration. */
  expiresAt: number;
}

export interface TtlCache<T> {
  /** The live value, or undefined when absent or expired. */
  get: (key: string) => T | undefined;
  set: (key: string, value: T, ttlMs: number) => void;
  /** Forgets one key. Used when a cached answer turns out not to play. */
  delete: (key: string) => void;
  clear: () => void;
  /** Live entries only. Exists for tests and for debugging, not for logic. */
  readonly size: number;
}

export interface TtlCacheOptions {
  /**
   * How many live entries to keep. The oldest insertion is dropped first --
   * insertion order, not access order, because `Map` preserves the former for
   * free and a resolution cache is written about as often as it is read, so
   * true LRU bookkeeping would cost more than the eviction quality is worth.
   */
  maxEntries?: number;
  /**
   * The clock. Injectable so a test can advance time without `jest.useFakeTimers`
   * leaking into every other timer in the module under test -- the resolver's
   * own tests are about expiry, not about scheduling.
   */
  now?: () => number;
}

export function createTtlCache<T>(options: TtlCacheOptions = {}): TtlCache<T> {
  // `() => Date.now()` rather than `Date.now`. Defaulting to the bare reference
  // captures whatever `Date.now` was at construction, which for a module-level
  // cache is import time -- so anything that legitimately replaces the global
  // clock afterwards (a test harness, a polyfill installed late) is silently
  // ignored by this cache and by nothing else in the app.
  const { maxEntries = 64, now = () => Date.now() } = options;

  const entries = new Map<string, Entry<T>>();

  /**
   * Drops an entry that has expired.
   *
   * Called from `get` rather than from a timer, which is the whole reason this
   * has no cleanup interval: a React Native app that sets a repeating timer
   * keeps the JS thread waking up forever for a cache nobody is reading. Lazy
   * expiry means a dead entry costs one map slot until it is either asked for
   * or evicted by the cap, and both of those are bounded.
   */
  function live(key: string): Entry<T> | undefined {
    const entry = entries.get(key);

    if (entry === undefined) {
      return undefined;
    }

    if (entry.expiresAt <= now()) {
      entries.delete(key);
      return undefined;
    }

    return entry;
  }

  return {
    get: key => live(key)?.value,

    set: (key, value, ttlMs) => {
      // Re-inserting must move the key to the back of the insertion order, or a
      // hot key written every few seconds would still be the first one evicted.
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });

      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) {
          break;
        }
        entries.delete(oldest.value);
      }
    },

    delete: key => {
      entries.delete(key);
    },

    clear: () => {
      entries.clear();
    },

    get size() {
      // Counts live entries, so an expired-but-not-yet-collected key does not
      // make this disagree with what `get` would return.
      let count = 0;
      for (const key of [...entries.keys()]) {
        if (live(key) !== undefined) {
          count += 1;
        }
      }
      return count;
    },
  };
}
