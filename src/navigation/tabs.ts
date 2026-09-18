import {
  fetchAnime,
  fetchAnimePage,
  fetchCartoonPage,
  fetchCartoons,
  fetchChannelPage,
  fetchChannels,
  fetchMoviePage,
  fetchMovies,
  fetchSeries,
  fetchSeriesPage,
  type ContentPage,
} from '../services/contentService';
import type { CatalogueCursor } from '../services/moviebox/catalogue';
import type { CardVariant } from '../theme';
import type { ContentItem } from '../types/content';
import type { CategoryKind } from '../types/database';

export interface CatalogLoadOptions {
  limit?: number;

  search?: string;
}

export interface CatalogSpec {
  categoryKind: CategoryKind;
  cardVariant: CardVariant;

  load: (options?: CatalogLoadOptions) => Promise<ContentItem[]>;

  /**
   * Fetches one page of the grid. `cursor` is null on the first page; `seen`
   * carries the ids already on screen so a page never repeats one.
   */
  loadPage: (
    cursor: CatalogueCursor | null,
    seen: ReadonlySet<string>,
  ) => Promise<ContentPage>;

  countNoun: readonly [singular: string, plural: string];

  emptyMessage: string;

  /**
   * Whether this tab gets its own shelf in search. Anime and cartoons search
   * the same global index as movies and series, so they would only repeat
   * those shelves.
   */
  searchable: boolean;
}

export type TabId =
  | 'home'
  | 'live-tv'
  | 'movies'
  | 'series'
  | 'anime'
  | 'cartoons';

export interface TabDef {
  id: TabId;

  /** Short form, used in the tab bar where six tabs share the width. */
  label: string;

  title: string;

  catalog: CatalogSpec | null;
}

export type CatalogTab = TabDef & { catalog: CatalogSpec };

export const TABS: readonly TabDef[] = [
  { id: 'home', label: 'Home', title: 'Home', catalog: null },
  {
    id: 'live-tv',
    label: 'Live',
    title: 'Live TV',
    catalog: {
      categoryKind: 'live_tv',

      cardVariant: 'landscape',
      load: options => fetchChannels(options),
      loadPage: () => fetchChannelPage(),
      countNoun: ['channel', 'channels'],
      emptyMessage:
        'No active channels were returned. Add rows to the `channels` table with `npm run import:iptv`.',
      searchable: true,
    },
  },
  {
    id: 'movies',
    label: 'Movies',
    title: 'Movies',
    catalog: {
      categoryKind: 'movie',
      cardVariant: 'poster',
      load: options => fetchMovies(options),
      loadPage: (cursor, seen) => fetchMoviePage(cursor, seen),
      countNoun: ['film', 'films'],
      emptyMessage: 'MovieBox returned no films. Check your connection.',
      searchable: true,
    },
  },
  {
    id: 'series',
    label: 'Series',
    title: 'Series',
    catalog: {
      categoryKind: 'series',
      cardVariant: 'poster',
      load: options => fetchSeries(options),
      loadPage: (cursor, seen) => fetchSeriesPage(cursor, seen),
      countNoun: ['series', 'series'],
      emptyMessage: 'MovieBox returned no series. Check your connection.',
      searchable: true,
    },
  },
  {
    id: 'anime',
    label: 'Anime',
    title: 'Anime',
    catalog: {
      categoryKind: 'anime',
      cardVariant: 'poster',

      load: options => fetchAnime(options),
      loadPage: (cursor, seen) => fetchAnimePage(cursor, seen),

      countNoun: ['title', 'titles'],
      emptyMessage: 'MovieBox returned no anime. Check your connection.',
      searchable: false,
    },
  },
  {
    id: 'cartoons',
    label: 'Toons',
    title: 'Cartoons',
    catalog: {
      categoryKind: 'cartoon',
      cardVariant: 'poster',
      load: options => fetchCartoons(options),
      loadPage: (cursor, seen) => fetchCartoonPage(cursor, seen),
      countNoun: ['title', 'titles'],
      emptyMessage: 'MovieBox returned no cartoons. Check your connection.',
      searchable: false,
    },
  },
];

export function isCatalogTab(tab: TabDef): tab is CatalogTab {
  return tab.catalog !== null;
}

export function catalogTabs(): CatalogTab[] {
  return TABS.filter(isCatalogTab);
}

export function searchableTabs(): CatalogTab[] {
  return catalogTabs().filter(tab => tab.catalog.searchable);
}

export function formatCount(
  count: number,
  [singular, plural]: CatalogSpec['countNoun'],
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Same as `formatCount`, but marks the total as a floor while more pages are
 * still available — the source never tells us the real total.
 */
export function formatPartialCount(
  count: number,
  noun: CatalogSpec['countNoun'],
  hasMore: boolean,
): string {
  return hasMore ? `${formatCount(count, noun)}+` : formatCount(count, noun);
}

export function catalogTitleList(): string {
  const titles = searchableTabs().map(tab => tab.title);

  if (titles.length <= 1) {
    return titles[0] ?? 'content';
  }

  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}
