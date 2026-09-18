// tabs.ts reaches contentService, which reaches the supabase client and its
// url polyfill — an ES module jest does not transform. The tab wiring under
// test never calls it, so a stub keeps the import graph loadable.
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import {
  catalogTabs,
  catalogTitleList,
  formatCount,
  formatPartialCount,
  isCatalogTab,
  searchableTabs,
  TABS,
} from '../navigation/tabs';

describe('TABS', () => {
  it('opens on home and offers a catalogue for every other tab', () => {
    expect(TABS[0].id).toBe('home');
    expect(isCatalogTab(TABS[0])).toBe(false);

    for (const tab of TABS.slice(1)) {
      expect(isCatalogTab(tab)).toBe(true);
    }
  });

  it('carries a series tab of its own', () => {
    const series = catalogTabs().find(tab => tab.id === 'series');

    expect(series).toBeDefined();
    expect(series?.title).toBe('Series');
    expect(series?.catalog.cardVariant).toBe('poster');
  });

  it('gives every catalogue tab a way to page', () => {
    for (const tab of catalogTabs()) {
      expect(typeof tab.catalog.loadPage).toBe('function');
    }
  });

  it('keeps every tab bar label short enough for a phone to split six ways', () => {
    for (const tab of TABS) {
      expect(tab.label.length).toBeLessThanOrEqual(6);
    }
  });

  it('leaves anime and cartoons out of search, where they only repeat', () => {
    // Both search the same global index as movies and series.
    expect(searchableTabs().map(tab => tab.id)).toEqual([
      'live-tv',
      'movies',
      'series',
    ]);
  });

  it('names only the searchable tabs in the search hint', () => {
    const list = catalogTitleList();

    expect(list).toBe('Live TV, Movies and Series');
    expect(list).not.toContain('Anime');
  });
});

describe('formatCount', () => {
  it('agrees the noun with the count', () => {
    expect(formatCount(1, ['film', 'films'])).toBe('1 film');
    expect(formatCount(0, ['film', 'films'])).toBe('0 films');
    expect(formatCount(12, ['film', 'films'])).toBe('12 films');
  });

  it('handles a noun that does not inflect', () => {
    expect(formatCount(1, ['series', 'series'])).toBe('1 series');
    expect(formatCount(9, ['series', 'series'])).toBe('9 series');
  });
});

describe('formatPartialCount', () => {
  it('marks the total as a floor while more pages remain', () => {
    expect(formatPartialCount(40, ['film', 'films'], true)).toBe('40 films+');
  });

  it('states the total plainly once the source is spent', () => {
    expect(formatPartialCount(40, ['film', 'films'], false)).toBe('40 films');
  });
});
