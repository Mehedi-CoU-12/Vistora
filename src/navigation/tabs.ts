import {
  fetchAnime,
  fetchCartoons,
  fetchChannels,
  fetchMovies,
} from '../services/contentService';
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

  countNoun: readonly [singular: string, plural: string];

  emptyMessage: string;
}

export type TabId = 'home' | 'live-tv' | 'movies' | 'anime' | 'cartoons';

export interface TabDef {
  id: TabId;

  label: string;

  title: string;

  catalog: CatalogSpec | null;
}

export type CatalogTab = TabDef & { catalog: CatalogSpec };

export const TABS: readonly TabDef[] = [
  { id: 'home', label: 'Home', title: 'Home', catalog: null },
  {
    id: 'live-tv',
    label: 'Live TV',
    title: 'Live TV',
    catalog: {
      categoryKind: 'live_tv',

      cardVariant: 'landscape',
      load: options => fetchChannels(options),
      countNoun: ['channel', 'channels'],
      emptyMessage:
        'No active channels were returned. Add rows to the `channels` table with `npm run import:iptv`.',
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
      countNoun: ['film', 'films'],
      emptyMessage: 'MovieBox returned no films. Check your connection.',
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

      countNoun: ['title', 'titles'],
      emptyMessage: 'MovieBox returned no anime. Check your connection.',
    },
  },
  {
    id: 'cartoons',
    label: 'Cartoons',
    title: 'Cartoons',
    catalog: {
      categoryKind: 'cartoon',
      cardVariant: 'poster',
      load: options => fetchCartoons(options),
      countNoun: ['title', 'titles'],
      emptyMessage: 'MovieBox returned no cartoons. Check your connection.',
    },
  },
];

export function isCatalogTab(tab: TabDef): tab is CatalogTab {
  return tab.catalog !== null;
}

export function catalogTabs(): CatalogTab[] {
  return TABS.filter(isCatalogTab);
}

export function formatCount(
  count: number,
  [singular, plural]: CatalogSpec['countNoun'],
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function catalogTitleList(): string {
  const titles = catalogTabs().map(tab => tab.title);

  if (titles.length <= 1) {
    return titles[0] ?? 'content';
  }

  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}
