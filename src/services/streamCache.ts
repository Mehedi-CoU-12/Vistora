interface Entry<T> {
  value: T;

  expiresAt: number;
}

export interface TtlCache<T> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T, ttlMs: number) => void;

  delete: (key: string) => void;
  clear: () => void;

  readonly size: number;
}

export interface TtlCacheOptions {
  maxEntries?: number;

  now?: () => number;
}

export function createTtlCache<T>(options: TtlCacheOptions = {}): TtlCache<T> {
  const { maxEntries = 64, now = () => Date.now() } = options;

  const entries = new Map<string, Entry<T>>();

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
