import {
  buildRails,
  homeRails,
  interleave,
  pickFeatured,
  withGenre,
  type Rail,
} from '../navigation/rails';
import type { Category, ContentItem } from '../types/content';

/**
 * The rail builder is what decides the shape of every browse screen in the app,
 * and it decides it from data -- so the interesting cases are all about
 * libraries that are thinner or odder than the one currently in the database.
 * Those are exactly the cases nobody sees while developing against a full
 * catalogue and everybody sees on a fresh clone.
 */

function item(id: string, overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id,
    kind: 'movie',
    title: `Title ${id}`,
    imageUrl: `https://cdn.example.com/${id}.jpg`,
    backdropUrl: null,
    categoryId: 'cat-a',
    stream: { url: 'https://cdn.example.com/a.m3u8', protocol: 'hls', isLive: false },
    ...overrides,
  };
}

function category(id: string, name: string): Category {
  return { id, slug: name.toLowerCase(), name, kind: 'movie' };
}

/** Four items in one category is comfortably over `MIN_RAIL_ITEMS`. */
function fill(categoryId: string, count: number, prefix: string): ContentItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(`${prefix}${index}`, { categoryId }),
  );
}

const source = (over: Partial<Parameters<typeof buildRails>[0]> = {}) => ({
  items: [],
  categories: [],
  cardVariant: 'poster' as const,
  fallbackTitle: 'Movies',
  idPrefix: 'movies',
  ...over,
});

describe('buildRails', () => {
  it('makes one rail per category that has enough content', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-a', 4, 'a'), ...fill('cat-b', 5, 'b')],
        categories: [category('cat-a', 'Action'), category('cat-b', 'Comedy')],
      }),
    );

    expect(rails.map(rail => rail.title)).toEqual(['Action', 'Comedy']);
    expect(rails[0].items).toHaveLength(4);
    expect(rails[1].items).toHaveLength(5);
  });

  /**
   * Category order is the editor's, expressed as `sort_order` and already
   * applied by `fetchCategories`. The builder must preserve it rather than
   * emitting rails in whatever order the items happened to arrive in.
   */
  it('follows the order the categories arrive in, not the items', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-b', 4, 'b'), ...fill('cat-a', 4, 'a')],
        categories: [category('cat-a', 'Action'), category('cat-b', 'Comedy')],
      }),
    );

    expect(rails.map(rail => rail.title)).toEqual(['Action', 'Comedy']);
  });

  /**
   * A rail of one or two cards looks like a mistake beside a rail of twenty,
   * and on a television it is a focus hazard: pressing RIGHT stops immediately,
   * which reads as a missed press rather than as the end of the row.
   */
  it('drops a category too thin to be a rail, without losing its items', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-a', 4, 'a'), ...fill('cat-b', 1, 'b')],
        categories: [category('cat-a', 'Action'), category('cat-b', 'Comedy')],
      }),
    );

    // One real rail is below MIN_RAILS_TO_SPLIT, so the whole kind falls back to
    // a single rail -- which is where the lone Comedy title survives.
    expect(rails).toHaveLength(1);
    expect(rails[0].title).toBe('Movies');
    expect(rails[0].items).toHaveLength(5);
  });

  /**
   * "Action" and "Classics" as the only two rails implies a catalogue that has
   * been organised. One rail called "Movies" is the honest rendering of a
   * catalogue that has not been.
   */
  it('falls back to a single rail rather than splitting into one', () => {
    const rails = buildRails(
      source({
        items: fill('cat-a', 6, 'a'),
        categories: [category('cat-a', 'Action')],
      }),
    );

    expect(rails).toHaveLength(1);
    expect(rails[0].title).toBe('Movies');
    expect(rails[0].id).toBe('movies:all');
  });

  it('puts uncategorised items in the fallback rail rather than nowhere', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-a', 2, 'a'), item('loose', { categoryId: null })],
        categories: [category('cat-a', 'Action')],
      }),
    );

    expect(rails).toHaveLength(1);
    expect(rails[0].items.map(entry => entry.id)).toContain('loose');
  });

  it('returns nothing at all for an empty kind, rather than an empty rail', () => {
    expect(buildRails(source({ categories: [category('cat-a', 'Action')] }))).toEqual(
      [],
    );
  });

  it('caps a rail so a row cannot run on forever', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-a', 40, 'a'), ...fill('cat-b', 4, 'b')],
        categories: [category('cat-a', 'Action'), category('cat-b', 'Comedy')],
      }),
    );

    expect(rails[0].items.length).toBeLessThanOrEqual(20);
  });

  it('gives every rail a distinct id, so React keeps rows apart', () => {
    const rails = buildRails(
      source({
        items: [...fill('cat-a', 4, 'a'), ...fill('cat-b', 4, 'b')],
        categories: [category('cat-a', 'Action'), category('cat-b', 'Comedy')],
      }),
    );

    expect(new Set(rails.map(rail => rail.id)).size).toBe(rails.length);
  });
});

describe('interleave', () => {
  const rail = (id: string): Rail => ({
    id,
    title: id,
    items: [],
    cardVariant: 'poster',
  });

  /**
   * The whole point: about one and a half rails are visible under a hero on a
   * television, so concatenating would mean a viewer never learns Live TV exists
   * without scrolling past every film genre.
   */
  it('mixes the kinds instead of stacking them', () => {
    expect(
      interleave([
        [rail('film-1'), rail('film-2')],
        [rail('tv-1'), rail('tv-2')],
      ]).map(entry => entry.id),
    ).toEqual(['film-1', 'tv-1', 'film-2', 'tv-2']);
  });

  it('keeps going once a shorter group runs out', () => {
    expect(
      interleave([
        [rail('film-1'), rail('film-2'), rail('film-3')],
        [rail('tv-1')],
      ]).map(entry => entry.id),
    ).toEqual(['film-1', 'tv-1', 'film-2', 'film-3']);
  });

  it('ignores empty groups', () => {
    expect(interleave([[], [rail('tv-1')], []]).map(entry => entry.id)).toEqual([
      'tv-1',
    ]);
  });

  /** Rails are re-derived on every reload; a changing order would move focus. */
  it('is stable for the same input', () => {
    const groups = [[rail('a'), rail('b')], [rail('c')]];
    expect(interleave(groups)).toEqual(interleave(groups));
  });
});

describe('pickFeatured', () => {
  const plain = item('plain', { imageUrl: null });
  const withPoster = item('poster');
  const described = item('described', { description: 'A synopsis.' });
  const full = item('full', {
    backdropUrl: 'https://cdn.example.com/wide.jpg',
    description: 'A synopsis.',
  });

  it('prefers a backdrop over everything else', () => {
    expect(pickFeatured([plain, withPoster, described, full], 0)?.id).toBe('full');
  });

  it('prefers a synopsis over bare artwork', () => {
    expect(pickFeatured([plain, withPoster, described], 0)?.id).toBe('described');
  });

  /**
   * A library with nothing well-furnished in it still gets a hero. The
   * alternative -- returning null unless something has a backdrop -- would mean
   * a blank band at the top of the Live TV screen forever, since no channel has
   * one.
   */
  it('still returns something when nothing is well furnished', () => {
    expect(pickFeatured([plain], 0)?.id).toBe('plain');
  });

  it('returns null only for an empty library', () => {
    expect(pickFeatured([], 0)).toBeNull();
  });

  /** The seed rotates among EQUALLY good candidates and never below them. */
  it('rotates between equally good candidates', () => {
    const a = item('a', { backdropUrl: 'x', description: 'd' });
    const b = item('b', { backdropUrl: 'y', description: 'd' });

    expect(pickFeatured([a, b], 0)?.id).toBe('a');
    expect(pickFeatured([a, b], 1)?.id).toBe('b');
    expect(pickFeatured([a, b], 2)?.id).toBe('a');
  });

  it('never lets a seed pick a worse candidate', () => {
    const candidates = [plain, withPoster, described, full];
    for (let seed = 0; seed < 25; seed += 1) {
      expect(pickFeatured(candidates, seed)?.id).toBe('full');
    }
  });

  /** A seed is whatever the caller had; none of it may index out of range. */
  it('survives a negative or fractional seed', () => {
    expect(pickFeatured([plain], -7)?.id).toBe('plain');
    expect(pickFeatured([plain], 3.7)?.id).toBe('plain');
  });
});

describe('withGenre', () => {
  it('resolves a category id into a readable genre', () => {
    const [tagged] = withGenre([item('a')], [category('cat-a', 'Action')]);
    expect(tagged.meta?.genre).toBe('Action');
  });

  it('keeps the metadata the mapper already set', () => {
    const [tagged] = withGenre(
      [item('a', { meta: { year: 1999 } })],
      [category('cat-a', 'Action')],
    );
    expect(tagged.meta).toEqual({ year: 1999, genre: 'Action' });
  });

  /**
   * Identity, not just equality. A new object every render looks like new data
   * to a FlatList and re-renders the row for nothing.
   */
  it('returns the same object when there is no genre to add', () => {
    const original = item('a', { categoryId: null });
    expect(withGenre([original], [])[0]).toBe(original);
  });

  it('leaves an item alone when its category is not in the list', () => {
    const original = item('a', { categoryId: 'cat-missing' });
    expect(withGenre([original], [category('cat-a', 'Action')])[0]).toBe(original);
  });
});

describe('homeRails', () => {
  const tab = {
    id: 'movies' as const,
    label: 'Movies',
    title: 'Movies',
    catalog: {
      categoryKind: 'movie' as const,
      cardVariant: 'poster' as const,
      load: async () => [],
      countNoun: ['film', 'films'] as const,
      emptyMessage: '',
    },
  };

  const categories = [
    category('cat-a', 'Action'),
    category('cat-b', 'Trending'),
    category('cat-c', 'Classics'),
  ];

  const items = [
    ...fill('cat-a', 4, 'a'),
    ...fill('cat-b', 20, 'b'),
    ...fill('cat-c', 9, 'c'),
  ];

  /**
   * The first film category in the current library is "Action" with four
   * titles. Beside a twenty-card rail on the home screen that reads as a row
   * that failed to load, so Home samples by what there is most of.
   */
  it('takes the fullest rails, not the first ones', () => {
    expect(homeRails(tab, items, categories, 2).map(rail => rail.title)).toEqual([
      'Trending',
      'Classics',
    ]);
  });

  /** Chosen by size; shown in the editor's order. Sorting the home screen by
      inventory would be a third and worse thing. */
  it('puts the ones it chose back into the editors order', () => {
    const chosen = homeRails(
      tab,
      [...fill('cat-a', 20, 'a'), ...fill('cat-b', 4, 'b'), ...fill('cat-c', 9, 'c')],
      categories,
      2,
    );

    expect(chosen.map(rail => rail.title)).toEqual(['Action', 'Classics']);
  });

  it('breaks a tie on size by the editors order', () => {
    const chosen = homeRails(
      tab,
      [...fill('cat-a', 5, 'a'), ...fill('cat-b', 5, 'b'), ...fill('cat-c', 5, 'c')],
      categories,
      2,
    );

    expect(chosen.map(rail => rail.title)).toEqual(['Action', 'Trending']);
  });

  /** Every home rail has somewhere further to go, by construction. */
  it('points every rail at its own tab', () => {
    for (const rail of homeRails(tab, items, categories, 3)) {
      expect(rail.seeAll).toBe('movies');
    }
  });

  it('returns fewer than the limit rather than padding', () => {
    expect(homeRails(tab, fill('cat-a', 6, 'a'), categories, 2)).toHaveLength(1);
  });
});
