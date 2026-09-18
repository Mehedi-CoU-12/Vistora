import { searchToPager } from '../services/moviebox/adapt';
import {
  clearHomeCache,
  client,
  deriveKeywords,
  homeRailsCached,
  loadCataloguePage,
  searchCataloguePage,
  startCursor,
} from '../services/moviebox/catalogue';
import type { ContentItem } from '../types/content';

interface Ask {
  keyword: string;
  page: number;
}

let asks: Ask[];

/** Builds a search payload carrying `count` subjects and a pager. */
function payload(
  ids: readonly string[],
  hasMore: boolean,
  subjectType = 1,
): unknown {
  return {
    results: [
      {
        subjects: ids.map(id => ({
          subjectId: id,
          title: `Title ${id}`,
          subjectType,
          cover: { url: `https://c/${id}.jpg` },
        })),
      },
    ],
    pager: {
      hasMore,
      nextPage: String(2),
      page: '1',
      perPage: 15,
      totalCount: ids.length,
    },
  };
}

/**
 * Serves each keyword `pages` pages of `perPage` subjects, with ids unique per
 * keyword so dedupe and cursor advancement are both observable.
 */
function serve(
  plan: Record<string, { pages: number; perPage?: number; subjectType?: number }>,
): void {
  jest.spyOn(client, 'post').mockImplementation(async (_path, body) => {
    const { keyword, page } = body as Ask;
    asks.push({ keyword, page });

    const entry = plan[keyword];
    if (entry === undefined) {
      return payload([], false);
    }

    if (page > entry.pages) {
      return payload([], false);
    }

    const perPage = entry.perPage ?? 3;
    const ids = Array.from(
      { length: perPage },
      (_unused, index) => `${keyword}-${page}-${index}`,
    );

    return payload(ids, page < entry.pages, entry.subjectType ?? 1);
  });
}

beforeEach(() => {
  asks = [];
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchToPager', () => {
  it('reads the pager the search endpoint sends', () => {
    expect(
      searchToPager({
        pager: { hasMore: true, nextPage: '3', page: '2', totalCount: '91' },
      }),
    ).toEqual({ hasMore: true, nextPage: 3, totalCount: 91 });
  });

  it('reads a stringified flag', () => {
    expect(searchToPager({ pager: { hasMore: 'true' } })?.hasMore).toBe(true);
    expect(searchToPager({ pager: { hasMore: 'false' } })?.hasMore).toBe(false);
  });

  it('reports no pager rather than inventing one', () => {
    expect(searchToPager({})).toBeNull();
    expect(searchToPager(null)).toBeNull();
  });

  it('treats a missing flag as the end', () => {
    expect(searchToPager({ pager: {} })?.hasMore).toBe(false);
  });
});

describe('searchCataloguePage', () => {
  it('passes the requested page through to the endpoint', async () => {
    serve({ love: { pages: 3 } });

    const page = await searchCataloguePage('love', 2);

    expect(asks).toEqual([{ keyword: 'love', page: 2 }]);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(true);
  });

  it('trusts the pager over the page size, which the server caps', async () => {
    jest
      .spyOn(client, 'post')
      .mockResolvedValue(payload(['a', 'b'], false));

    expect((await searchCataloguePage('love', 1, 20)).hasMore).toBe(false);
  });

  it('assumes more when the server sends no pager at all', async () => {
    jest.spyOn(client, 'post').mockResolvedValue({
      results: [{ subjects: [{ subjectId: 'a', title: 'A', subjectType: 1 }] }],
    });

    expect((await searchCataloguePage('love', 1)).hasMore).toBe(true);
  });
});

describe('loadCataloguePage', () => {
  it('pages one keyword before moving to the next', async () => {
    serve({ love: { pages: 2 }, war: { pages: 1 } });

    const first = await loadCataloguePage(['love', 'war'], null, { target: 3 });

    expect(asks).toEqual([{ keyword: 'love', page: 1 }]);
    expect(first.cursor).toEqual({ keywordIndex: 0, page: 2 });
    expect(first.done).toBe(false);

    const second = await loadCataloguePage(['love', 'war'], first.cursor, {
      target: 3,
    });

    expect(asks[1]).toEqual({ keyword: 'love', page: 2 });

    // love reported its last page, so the cursor rolls onto war.
    expect(second.cursor).toEqual({ keywordIndex: 1, page: 1 });
  });

  it('reports done once the keyword list is spent', async () => {
    serve({ love: { pages: 1 } });

    const page = await loadCataloguePage(['love'], null, { target: 3 });

    expect(page.cursor).toBeNull();
    expect(page.done).toBe(true);
  });

  it('keeps collecting across keywords until it reaches the target', async () => {
    serve({ a: { pages: 1 }, b: { pages: 1 }, c: { pages: 1 } });

    const page = await loadCataloguePage(['a', 'b', 'c'], null, { target: 9 });

    expect(page.items).toHaveLength(9);
    expect(asks).toHaveLength(3);
  });

  it('never returns an item the caller already holds', async () => {
    serve({ love: { pages: 1 } });

    const page = await loadCataloguePage(['love'], null, {
      seen: new Set(['love-1-0', 'love-1-1']),
      target: 3,
    });

    expect(page.items.map(item => item.id)).toEqual(['love-1-2']);
  });

  it('keeps only the requested kind', async () => {
    serve({
      love: { pages: 1, subjectType: 2 },
      war: { pages: 1, subjectType: 1 },
    });

    const series = await loadCataloguePage(['love', 'war'], null, {
      kind: 'series',
      target: 99,
    });

    expect(series.items).toHaveLength(3);
    expect(series.items.every(item => item.kind === 'series')).toBe(true);
  });

  it('skips a keyword that returns nothing instead of stalling', async () => {
    // "action" is a genre word, not a title: the real endpoint answers it with
    // an empty result set.
    serve({ action: { pages: 0 }, love: { pages: 1 } });

    const page = await loadCataloguePage(['action', 'love'], null, {
      target: 3,
    });

    expect(asks.map(ask => ask.keyword)).toEqual(['action', 'love']);
    expect(page.items).toHaveLength(3);
  });

  it('steps past a keyword that throws', async () => {
    jest.spyOn(client, 'post').mockImplementation(async (_path, body) => {
      const { keyword, page } = body as Ask;
      asks.push({ keyword, page });

      if (keyword === 'broken') {
        throw new Error('host refused');
      }

      return payload(['ok-1'], false);
    });

    const page = await loadCataloguePage(['broken', 'love'], null, {
      target: 1,
    });

    expect(page.items.map(item => item.id)).toEqual(['ok-1']);
  });

  it('surfaces the failure when every keyword throws', async () => {
    jest.spyOn(client, 'post').mockRejectedValue(new Error('host refused'));

    await expect(
      loadCataloguePage(['broken'], null, { target: 1 }),
    ).rejects.toThrow('host refused');
  });

  it('bounds how many requests one page may issue', async () => {
    // Every keyword yields nothing, so only the request budget stops the walk.
    serve({});

    const keywords = Array.from({ length: 40 }, (_unused, i) => `k${i}`);
    const page = await loadCataloguePage(keywords, null, { target: 24 });

    expect(asks.length).toBeLessThanOrEqual(8);
    expect(page.done).toBe(false);
    expect(page.cursor?.keywordIndex).toBe(asks.length);
  });

  it('starts at the first keyword when given no cursor', async () => {
    serve({ love: { pages: 1 } });

    await loadCataloguePage(['love'], null, { target: 1 });

    expect(asks[0]).toEqual({ keyword: 'love', page: startCursor().page });
  });
});

describe('deriveKeywords', () => {
  function titled(title: string, id = title): ContentItem {
    return {
      id,
      kind: 'movie',
      title,
      imageUrl: null,
      backdropUrl: null,
      categoryId: null,
      stream: null,
    };
  }

  it('ranks words by how many titles carry them', () => {
    const keywords = deriveKeywords([
      titled('Shadow Hunter'),
      titled('Shadow Realm'),
      titled('Shadow Games'),
      titled('Desert Wind'),
    ]);

    expect(keywords[0]).toBe('shadow');
    expect(keywords).toContain('desert');
  });

  it('skips words too short to be a useful search', () => {
    expect(deriveKeywords([titled('Up In The Air')])).not.toContain('air');
  });

  it('skips filler and release tags that match everything', () => {
    const keywords = deriveKeywords([
      titled('The Great Escape Hindi Dubbed'),
      titled('The Quiet Season Part Two'),
    ]);

    for (const noise of ['the', 'hindi', 'dubbed', 'season', 'part']) {
      expect(keywords).not.toContain(noise);
    }

    expect(keywords).toContain('great');
  });

  it('counts a word once per title, however often it repeats in it', () => {
    const keywords = deriveKeywords([
      titled('Ghost Ghost Ghost'),
      titled('Storm Chaser'),
      titled('Storm Warning'),
    ]);

    expect(keywords.indexOf('storm')).toBeLessThan(keywords.indexOf('ghost'));
  });

  it('honours the limit', () => {
    // Distinct alphabetic words: digits are not part of a keyword.
    const words = [
      'alpha',
      'bravo',
      'delta',
      'gamma',
      'sigma',
      'omega',
      'theta',
      'kappa',
    ];

    const items = words.map((word, i) => titled(`${word} river`, `id-${i}`));

    expect(deriveKeywords(items, 5)).toHaveLength(5);

    // "river" is in every title, so it outranks the rest.
    expect(deriveKeywords(items, 5)[0]).toBe('river');
  });

  it('is stable for the same titles, which the cursor depends on', () => {
    const items = [titled('Shadow Hunter'), titled('Desert Storm')];

    expect(deriveKeywords(items)).toEqual(deriveKeywords(items));
  });

  it('returns nothing for titles with no usable words', () => {
    expect(deriveKeywords([titled('A B C'), titled('12 34')])).toEqual([]);
  });
});

describe('homeRailsCached', () => {
  beforeEach(() => {
    clearHomeCache();
  });

  it('fetches the fixed home payload once and shares it', async () => {
    const get = jest
      .spyOn(client, 'get')
      .mockResolvedValue({ items: [{ title: 'Row', subjects: [] }] });

    await Promise.all([homeRailsCached(), homeRailsCached()]);
    await homeRailsCached();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const get = jest
      .spyOn(client, 'get')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ items: [] });

    await expect(homeRailsCached()).rejects.toThrow('offline');
    await expect(homeRailsCached()).resolves.toEqual([]);

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('refetches once the cache is cleared', async () => {
    const get = jest.spyOn(client, 'get').mockResolvedValue({ items: [] });

    await homeRailsCached();
    clearHomeCache();
    await homeRailsCached();

    expect(get).toHaveBeenCalledTimes(2);
  });
});
