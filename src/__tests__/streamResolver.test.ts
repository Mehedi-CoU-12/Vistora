import { AppError } from '../services/errors';
import { storedStreamSource } from '../services/sources/storedStream';
import {
  canResolveAny,
  invalidateResolution,
  qualityRank,
  rankCandidates,
  registerSource,
  registeredSources,
  resetSources,
  resolveStream,
  type StreamCandidate,
  type StreamSource,
} from '../services/streamResolver';
import type { ContentItem, Stream } from '../types/content';

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'movie-1',
    kind: 'movie',
    title: 'A Film',
    imageUrl: null,
    backdropUrl: null,
    categoryId: 'cat-1',
    stream: null,
    ...overrides,
  };
}

function makeStream(url: string): Stream {
  return { url, protocol: 'mp4', isLive: false };
}

function makeCandidate(
  url: string,
  quality?: string,
  label = url,
): StreamCandidate {
  return { stream: makeStream(url), label, quality };
}







function makeSource(
  id: string,
  candidates: StreamCandidate[],
  overrides: Partial<StreamSource> = {},
): StreamSource {
  return {
    id,
    canResolve: () => true,
    resolve: jest.fn(async () => candidates),
    ...overrides,
  };
}

beforeEach(() => {
  resetSources();
});

describe('qualityRank', () => {
  it('reads a line count off a label', () => {
    expect(qualityRank('1080p')).toBe(1080);
    expect(qualityRank('720P')).toBe(720);
    expect(qualityRank('2160')).toBe(2160);
  });

  it('understands the names that are not line counts', () => {
    expect(qualityRank('4K')).toBe(2160);
    expect(qualityRank('uhd')).toBe(2160);
    expect(qualityRank('HD')).toBe(720);
    expect(qualityRank('sd')).toBe(480);
  });

  
  
  it('sorts an unknown quality last rather than in the middle', () => {
    expect(qualityRank(undefined)).toBe(0);
    expect(qualityRank('best available')).toBe(0);
    expect(qualityRank(undefined)).toBeLessThan(qualityRank('480p'));
  });
});

describe('rankCandidates', () => {
  it('puts the highest resolution first', () => {
    const ranked = rankCandidates([
      makeCandidate('a', '720p'),
      makeCandidate('b', '4K'),
      makeCandidate('c', '1080p'),
    ]);

    expect(ranked.map(c => c.stream.url)).toEqual(['b', 'c', 'a']);
  });

  
  
  
  it('leaves equal qualities in the order they arrived', () => {
    const ranked = rankCandidates([
      makeCandidate('first', '1080p'),
      makeCandidate('second', '1080p'),
      makeCandidate('third', '1080p'),
    ]);

    expect(ranked.map(c => c.stream.url)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('does not mutate the list it was given', () => {
    const original = [makeCandidate('a', '480p'), makeCandidate('b', '1080p')];
    rankCandidates(original);

    expect(original.map(c => c.stream.url)).toEqual(['a', 'b']);
  });
});

describe('registerSource', () => {
  it('keeps sources in registration order', () => {
    registerSource(makeSource('first', []));
    registerSource(makeSource('second', []));

    expect(registeredSources().map(s => s.id)).toEqual(['first', 'second']);
  });

  
  
  it('replaces a source registered twice under the same id', () => {
    registerSource(makeSource('dup', [makeCandidate('old')]));
    registerSource(makeSource('dup', [makeCandidate('new')]));

    expect(registeredSources()).toHaveLength(1);
  });

  it('replaces in place rather than moving to the end', () => {
    registerSource(makeSource('a', []));
    registerSource(makeSource('b', []));
    registerSource(makeSource('a', []));

    expect(registeredSources().map(s => s.id)).toEqual(['a', 'b']);
  });
});

describe('canResolveAny', () => {
  it('is false when nothing claims the item', () => {
    registerSource(makeSource('no', [], { canResolve: () => false }));

    expect(canResolveAny(makeItem())).toBe(false);
  });

  it('is true as soon as one source claims it', () => {
    registerSource(makeSource('no', [], { canResolve: () => false }));
    registerSource(makeSource('yes', [], { canResolve: () => true }));

    expect(canResolveAny(makeItem())).toBe(true);
  });
});

describe('resolveStream', () => {
  it('returns the candidates a source produced', async () => {
    registerSource(makeSource('one', [makeCandidate('http://a', '1080p')]));

    const playback = await resolveStream(makeItem());

    expect(playback.itemId).toBe('movie-1');
    expect(playback.candidates).toHaveLength(1);
    expect(playback.candidates[0].stream.url).toBe('http://a');
  });

  
  
  it('merges every source rather than stopping at the first', async () => {
    registerSource(makeSource('live', [makeCandidate('http://live', '1080p')]));
    registerSource(
      makeSource('stored', [makeCandidate('http://stored', '480p')]),
    );

    const playback = await resolveStream(makeItem());

    expect(playback.candidates.map(c => c.stream.url)).toEqual([
      'http://live',
      'http://stored',
    ]);
  });

  it('ranks the merged list by quality, across sources', async () => {
    registerSource(makeSource('first', [makeCandidate('http://sd', '480p')]));
    registerSource(makeSource('second', [makeCandidate('http://hd', '1080p')]));

    const playback = await resolveStream(makeItem());

    expect(playback.candidates[0].stream.url).toBe('http://hd');
  });

  it('never asks a source that does not claim the item', async () => {
    const declined = makeSource('declined', [makeCandidate('http://no')], {
      canResolve: () => false,
    });
    registerSource(declined);
    registerSource(makeSource('ok', [makeCandidate('http://yes')]));

    await resolveStream(makeItem());

    expect(declined.resolve).not.toHaveBeenCalled();
  });

  
  it('skips a source that throws and keeps the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    registerSource(
      makeSource('broken', [], {
        resolve: jest.fn(async () => {
          throw new Error('host unreachable');
        }),
      }),
    );
    registerSource(makeSource('working', [makeCandidate('http://good')]));

    const playback = await resolveStream(makeItem());

    expect(playback.candidates.map(c => c.stream.url)).toEqual(['http://good']);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('treats an empty answer as "not mine", not as an error', async () => {
    registerSource(makeSource('empty', []));
    registerSource(makeSource('full', [makeCandidate('http://good')]));

    const playback = await resolveStream(makeItem());

    expect(playback.candidates).toHaveLength(1);
  });

  
  
  it('drops a URL that two sources both returned', async () => {
    registerSource(makeSource('a', [makeCandidate('http://same', '1080p')]));
    registerSource(makeSource('b', [makeCandidate('http://same', '720p')]));

    const playback = await resolveStream(makeItem());

    expect(playback.candidates).toHaveLength(1);
    
    expect(playback.candidates[0].quality).toBe('1080p');
  });

  it('throws a non-retryable AppError when nothing can play the item', async () => {
    registerSource(makeSource('empty', []));

    await expect(resolveStream(makeItem())).rejects.toBeInstanceOf(AppError);

    await expect(resolveStream(makeItem())).rejects.toMatchObject({
      kind: 'notFound',
      retryable: false,
    });
  });

  it('throws when there are no sources at all', async () => {
    await expect(resolveStream(makeItem())).rejects.toMatchObject({
      kind: 'notFound',
    });
  });

  it('serves a second resolution from the cache', async () => {
    const source = makeSource('one', [makeCandidate('http://a')]);
    registerSource(source);

    await resolveStream(makeItem());
    await resolveStream(makeItem());

    expect(source.resolve).toHaveBeenCalledTimes(1);
  });

  it('caches per item rather than globally', async () => {
    const source = makeSource('one', [makeCandidate('http://a')]);
    registerSource(source);

    await resolveStream(makeItem({ id: 'movie-1' }));
    await resolveStream(makeItem({ id: 'movie-2' }));

    expect(source.resolve).toHaveBeenCalledTimes(2);
  });

  
  it('does not confuse two kinds that share an id', async () => {
    const source = makeSource('one', [makeCandidate('http://a')]);
    registerSource(source);

    await resolveStream(makeItem({ id: 'x', kind: 'movie' }));
    await resolveStream(makeItem({ id: 'x', kind: 'episode' }));

    expect(source.resolve).toHaveBeenCalledTimes(2);
  });

  
  
  it('resolves afresh after the item is invalidated', async () => {
    const source = makeSource('one', [makeCandidate('http://a')]);
    registerSource(source);

    await resolveStream(makeItem());
    invalidateResolution(makeItem());
    await resolveStream(makeItem());

    expect(source.resolve).toHaveBeenCalledTimes(2);
  });

  it('re-resolves once the shortest contributing TTL has passed', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);

    const brief = makeSource('brief', [makeCandidate('http://a')], {
      ttlMs: 1000,
    });
    const long = makeSource('long', [makeCandidate('http://b')], {
      ttlMs: 60_000,
    });
    registerSource(brief);
    registerSource(long);

    await resolveStream(makeItem());

    
    
    now.mockReturnValue(2000);
    await resolveStream(makeItem());

    expect(brief.resolve).toHaveBeenCalledTimes(2);

    now.mockRestore();
  });
});

describe('storedStreamSource', () => {
  it('declines an item whose row carries no URL', () => {
    expect(storedStreamSource.canResolve(makeItem({ stream: null }))).toBe(
      false,
    );
  });

  it('claims an item whose row carries one', () => {
    const item = makeItem({ stream: makeStream('http://stored') });
    expect(storedStreamSource.canResolve(item)).toBe(true);
  });

  it('returns the row URL unchanged, so playback is what it always was', async () => {
    const stream = makeStream('http://stored');
    const candidates = await storedStreamSource.resolve(
      makeItem({ stream }),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].stream).toEqual(stream);
  });

  it('reports the quality the row claimed, when it claimed one', async () => {
    const candidates = await storedStreamSource.resolve(
      makeItem({ stream: makeStream('http://a'), meta: { quality: '1080p' } }),
    );

    expect(candidates[0].quality).toBe('1080p');
  });

  it('returns nothing rather than throwing when there is no stream', async () => {
    expect(await storedStreamSource.resolve(makeItem({ stream: null }))).toEqual(
      [],
    );
  });
});
