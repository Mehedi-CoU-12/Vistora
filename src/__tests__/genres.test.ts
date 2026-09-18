import {
  deriveGenres,
  filterByCategory,
  genreId,
  GENRE_PREFIX,
  itemGenres,
  matchesCategory,
} from '../services/genres';
import type { ContentItem } from '../types/content';

function item(
  id: string,
  genre?: string,
  overrides: Partial<ContentItem> = {},
): ContentItem {
  return {
    id,
    kind: 'movie',
    title: `Title ${id}`,
    imageUrl: null,
    backdropUrl: null,
    categoryId: null,
    stream: null,
    meta: genre === undefined ? undefined : { genre },
    ...overrides,
  };
}

describe('itemGenres', () => {
  it('splits the loose genre string the api sends', () => {
    expect(itemGenres(item('1', 'Action, Drama'))).toEqual([
      'Action',
      'Drama',
    ]);
    expect(itemGenres(item('2', 'Comedy / Romance'))).toEqual([
      'Comedy',
      'Romance',
    ]);
    expect(itemGenres(item('3', 'Crime & Thriller'))).toEqual([
      'Crime',
      'Thriller',
    ]);
  });

  it('drops repeats that differ only by case', () => {
    expect(itemGenres(item('1', 'Action, action'))).toEqual(['Action']);
  });

  it('returns nothing when there is no genre', () => {
    expect(itemGenres(item('1'))).toEqual([]);
    expect(itemGenres(item('2', '   '))).toEqual([]);
  });
});

describe('deriveGenres', () => {
  const items = [
    item('1', 'Action'),
    item('2', 'Action'),
    item('3', 'Action, Drama'),
    item('4', 'Drama'),
    item('5', 'Drama'),
    item('6', 'Horror'),
  ];

  it('orders the chips by how much they cover', () => {
    expect(deriveGenres(items, 'movie').map(c => c.name)).toEqual([
      'Action',
      'Drama',
    ]);
  });

  it('folds away a genre too small to be worth a chip', () => {
    // Horror covers one item, below the three-item floor.
    expect(deriveGenres(items, 'movie').map(c => c.name)).not.toContain(
      'Horror',
    );
  });

  it('honours a caller supplied floor', () => {
    expect(deriveGenres(items, 'movie', 1).map(c => c.name)).toContain(
      'Horror',
    );
  });

  it('carries the kind and a usable slug', () => {
    const [action] = deriveGenres(items, 'series');

    expect(action.kind).toBe('series');
    expect(action.id).toBe(`${GENRE_PREFIX}action`);
    expect(action.slug).toBe('action');
  });

  it('returns nothing when no item carries a genre', () => {
    expect(deriveGenres([item('1'), item('2')], 'movie')).toEqual([]);
  });
});

describe('matchesCategory', () => {
  it('matches a derived genre on any of the item genres', () => {
    const multi = item('1', 'Action, Drama');

    expect(matchesCategory(multi, genreId('Action'))).toBe(true);
    expect(matchesCategory(multi, genreId('drama'))).toBe(true);
    expect(matchesCategory(multi, genreId('Horror'))).toBe(false);
  });

  it('falls back to the stored category id for a real category', () => {
    const channel = item('1', undefined, { categoryId: 'cat-a' });

    expect(matchesCategory(channel, 'cat-a')).toBe(true);
    expect(matchesCategory(channel, 'cat-b')).toBe(false);
  });
});

describe('filterByCategory', () => {
  const items = [
    item('1', 'Action'),
    item('2', 'Drama'),
    item('3', undefined, { categoryId: 'cat-a' }),
  ];

  it('passes everything through when nothing is selected', () => {
    expect(filterByCategory(items, null)).toHaveLength(3);
  });

  it('keeps only the selected genre', () => {
    expect(filterByCategory(items, genreId('Action')).map(i => i.id)).toEqual([
      '1',
    ]);
  });

  it('keeps only the selected stored category', () => {
    expect(filterByCategory(items, 'cat-a').map(i => i.id)).toEqual(['3']);
  });
});
