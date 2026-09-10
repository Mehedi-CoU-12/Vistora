import {
  ilikeFilter,
  isSearchable,
  MIN_SEARCH_LENGTH,
  normalizeSearchTerm,
} from '../services/searchQuery';

describe('normalizeSearchTerm', () => {
  it('trims the surrounding whitespace a soft keyboard adds', () => {
    expect(normalizeSearchTerm('  star wars ')).toBe('star wars');
  });

  it('collapses runs of whitespace, which no title contains', () => {
    expect(normalizeSearchTerm('star   wars')).toBe('star wars');
    expect(normalizeSearchTerm('star\t\nwars')).toBe('star wars');
  });

  it('strips backslashes, which would end the term in a dangling LIKE escape', () => {
    expect(normalizeSearchTerm('iron\\')).toBe('iron');
    expect(normalizeSearchTerm('a\\b')).toBe('ab');
  });

  it('normalises a term of only backslashes to nothing searchable', () => {
    expect(isSearchable(normalizeSearchTerm('\\\\\\'))).toBe(false);
  });

  it('leaves the LIKE wildcards alone: they broaden a match, they cannot escape it', () => {
    expect(normalizeSearchTerm('spider_man')).toBe('spider_man');
    expect(normalizeSearchTerm('100%')).toBe('100%');
    expect(normalizeSearchTerm('star*')).toBe('star*');
  });

  it('keeps the punctuation real titles contain', () => {
    expect(normalizeSearchTerm('Crouching Tiger, Hidden Dragon')).toBe(
      'Crouching Tiger, Hidden Dragon',
    );
    expect(normalizeSearchTerm('Alien (1979)')).toBe('Alien (1979)');
  });
});

describe('isSearchable', () => {
  it('rejects a term shorter than the minimum', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('a')).toBe(false);
  });

  it('accepts a term at the minimum', () => {
    expect(isSearchable('ab')).toBe(true);
    expect('ab'.length).toBe(MIN_SEARCH_LENGTH);
  });
});

describe('ilikeFilter', () => {
  it('builds one ilike clause per column', () => {
    expect(ilikeFilter(['name', 'description'], 'news')).toBe(
      'name.ilike."%news%",description.ilike."%news%"',
    );
  });

  it('handles a single column', () => {
    expect(ilikeFilter(['title'], 'news')).toBe('title.ilike."%news%"');
  });

  /**
   * The case the quoting exists for. PostgREST splits an `or` on commas, so an
   * unquoted value containing one would be read as the start of another filter
   * and the request would fail -- on an entirely ordinary film title.
   */
  it('keeps a comma inside the value rather than letting it split the filter', () => {
    const filter = ilikeFilter(['title'], 'Crouching Tiger, Hidden Dragon');

    expect(filter).toBe('title.ilike."%Crouching Tiger, Hidden Dragon%"');
    // One clause, not two: everything after the column name is inside the quotes.
    expect(filter.split('.ilike.')).toHaveLength(2);
  });

  it('keeps parentheses, which PostgREST would otherwise read as grouping', () => {
    expect(ilikeFilter(['title'], 'Alien (1979)')).toBe(
      'title.ilike."%Alien (1979)%"',
    );
  });

  it('escapes a double quote so it cannot close the value early', () => {
    expect(ilikeFilter(['title'], 'say "hello"')).toBe(
      'title.ilike."%say \\"hello\\"%"',
    );
  });

  it('quotes a term that is itself a PostgREST operator name', () => {
    // 'eq' unquoted after `.ilike.` is just a value, but the quoting means even
    // a term like `not.eq` cannot be reinterpreted as syntax.
    expect(ilikeFilter(['title'], 'not.eq')).toBe('title.ilike."%not.eq%"');
  });

  it('applies the same value to every column', () => {
    const filter = ilikeFilter(
      ['title', 'competition', 'home_team', 'away_team'],
      'united',
    );

    expect(filter.split(',')).toEqual([
      'title.ilike."%united%"',
      'competition.ilike."%united%"',
      'home_team.ilike."%united%"',
      'away_team.ilike."%united%"',
    ]);
  });
});
