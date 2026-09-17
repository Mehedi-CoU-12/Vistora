import { createTtlCache } from '../services/streamCache';

/**
 * A controllable clock, so expiry can be tested without fake timers.
 *
 * `jest.useFakeTimers` would work but would also take over every other timer in
 * whatever else the test file touches, and these tests are about the passage of
 * time rather than about scheduling. The cache takes `now` for exactly this.
 */
function clock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createTtlCache', () => {
  it('returns a value inside its TTL', () => {
    const time = clock();
    const cache = createTtlCache<string>({ now: time.now });

    cache.set('a', 'value', 1000);

    time.advance(999);
    expect(cache.get('a')).toBe('value');
  });

  // The whole reason this is a TTL cache rather than an LRU: a resolved URL
  // stops working, it does not merely get old.
  it('drops a value once its TTL has passed', () => {
    const time = clock();
    const cache = createTtlCache<string>({ now: time.now });

    cache.set('a', 'value', 1000);

    time.advance(1000);
    expect(cache.get('a')).toBeUndefined();
  });

  it('reports a miss for a key it never had', () => {
    const cache = createTtlCache<string>();
    expect(cache.get('nothing')).toBeUndefined();
  });

  it('forgets one key without disturbing the others', () => {
    const cache = createTtlCache<string>();

    cache.set('a', 'one', 1000);
    cache.set('b', 'two', 1000);
    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('two');
  });

  it('clears everything', () => {
    const cache = createTtlCache<string>();

    cache.set('a', 'one', 1000);
    cache.set('b', 'two', 1000);
    cache.clear();

    expect(cache.size).toBe(0);
  });

  it('evicts the oldest insertion once past the cap', () => {
    const cache = createTtlCache<string>({ maxEntries: 2 });

    cache.set('a', 'one', 10_000);
    cache.set('b', 'two', 10_000);
    cache.set('c', 'three', 10_000);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('two');
    expect(cache.get('c')).toBe('three');
  });

  // Without the delete-then-set in `set`, a key rewritten on every press would
  // keep its original position and be the first one evicted despite being the
  // hottest entry in the cache.
  it('treats a rewrite as a fresh insertion for eviction order', () => {
    const cache = createTtlCache<string>({ maxEntries: 2 });

    cache.set('a', 'one', 10_000);
    cache.set('b', 'two', 10_000);
    cache.set('a', 'one again', 10_000);
    cache.set('c', 'three', 10_000);

    expect(cache.get('a')).toBe('one again');
    expect(cache.get('b')).toBeUndefined();
  });

  it('extends the life of a key that is written again', () => {
    const time = clock();
    const cache = createTtlCache<string>({ now: time.now });

    cache.set('a', 'one', 1000);
    time.advance(900);
    cache.set('a', 'two', 1000);
    time.advance(900);

    expect(cache.get('a')).toBe('two');
  });

  // `size` has to agree with `get`, or a debugging session spent reading it
  // would be chasing entries that are already dead.
  it('counts only entries that are still live', () => {
    const time = clock();
    const cache = createTtlCache<string>({ now: time.now });

    cache.set('short', 'a', 500);
    cache.set('long', 'b', 5000);

    expect(cache.size).toBe(2);

    time.advance(1000);
    expect(cache.size).toBe(1);
  });
});
