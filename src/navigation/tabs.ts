import {
  fetchChannels,
  fetchMovies,
  fetchSportsEvents,
} from '../services/contentService';
import type { CardVariant } from '../theme';
import type { ContentItem } from '../types/content';
import type { CategoryKind } from '../types/database';

/**
 * What the app browses, in one list.
 *
 * ---------------------------------------------------------------------------
 * Why the data source lives in the tab definition
 * ---------------------------------------------------------------------------
 * Every tab except Home is the same screen -- a category filter beside a grid --
 * pointed at a different query. Describing that difference as DATA rather than
 * as five near-identical screen components means `CatalogScreen` is written
 * once, and adding a content kind is an entry in this array.
 *
 * It also removes a class of bug the previous shape invited. The home screen
 * used to hard-code its own list of rows, so the set of things on the home
 * screen and the set of things you could browse were two lists that had to be
 * kept in step by hand. Home now derives its shelves from `catalogTabs()`, so a
 * new kind appears in both places or neither.
 *
 * ---------------------------------------------------------------------------
 * Anime, and empty tabs generally
 * ---------------------------------------------------------------------------
 * `anime` is a `category_kind` added by supabase/migrations/0002. A tab whose
 * query returns nothing renders `emptyMessage` and is otherwise completely
 * normal -- which is deliberate: it means the tab list does not have to be
 * negotiated with the contents of the database at startup, and a fresh clone
 * shows the same navigation as a full library.
 */

/** A tab that browses one kind of content. */
export interface CatalogSpec {
  /** Which categories become the filter list down the side (or along the top). */
  categoryKind: CategoryKind;
  cardVariant: CardVariant;
  /**
   * Loads the tab's items. `limit` is passed by the home screen, which shows a
   * preview of each catalog rather than the whole thing.
   */
  load: (limit?: number) => Promise<ContentItem[]>;
  /** Count wording, singular and plural: "1 channel", "42 channels". */
  countNoun: readonly [singular: string, plural: string];
  /** Shown when the query succeeds and comes back empty. */
  emptyMessage: string;
}

export type TabId =
  | 'home'
  | 'live-tv'
  | 'movies'
  | 'cartoons'
  | 'anime'
  | 'sports';

export interface TabDef {
  id: TabId;
  /**
   * Nav label. Kept short deliberately: six tabs across a 390dp phone leaves
   * about 60dp each, so a two-word label is the ceiling.
   */
  label: string;
  /** Heading on the tab's own screen, and on its home shelf. */
  title: string;
  /** Null on Home, which is shelves of everything rather than one catalog. */
  catalog: CatalogSpec | null;
}

/** A tab that is definitely a catalog, so `.catalog` needs no null check. */
export type CatalogTab = TabDef & { catalog: CatalogSpec };

export const TABS: readonly TabDef[] = [
  { id: 'home', label: 'Home', title: 'Home', catalog: null },
  {
    id: 'live-tv',
    label: 'Live TV',
    title: 'Live TV',
    catalog: {
      categoryKind: 'live_tv',
      // 16:9, because a channel's artwork is a logo on a banner rather than a
      // poster.
      cardVariant: 'landscape',
      load: limit => fetchChannels({ limit }),
      countNoun: ['channel', 'channels'],
      emptyMessage:
        'No active channels were returned. Add rows to the `channels` table, or apply supabase/seed.sql.',
    },
  },
  {
    id: 'movies',
    label: 'Movies',
    title: 'Movies',
    catalog: {
      categoryKind: 'movie',
      cardVariant: 'poster',
      load: limit => fetchMovies({ categoryKind: 'movie', limit }),
      countNoun: ['film', 'films'],
      emptyMessage:
        'No films yet. Run `npm run import:movies`, then apply the seed file it writes.',
    },
  },
  {
    id: 'cartoons',
    label: 'Cartoons',
    title: 'Cartoons',
    catalog: {
      categoryKind: 'cartoon',
      cardVariant: 'poster',
      load: limit => fetchMovies({ categoryKind: 'cartoon', limit }),
      countNoun: ['cartoon', 'cartoons'],
      emptyMessage:
        'No cartoons yet. Run `npm run import:cartoons`, then apply the seed file it writes.',
    },
  },
  {
    id: 'anime',
    label: 'Anime',
    title: 'Anime',
    catalog: {
      categoryKind: 'anime',
      cardVariant: 'poster',
      load: limit => fetchMovies({ categoryKind: 'anime', limit }),
      // "1 anime / 42 animes" is wrong in both directions, so the count says
      // "title" here rather than bending the tab's own name into a plural.
      countNoun: ['title', 'titles'],
      emptyMessage:
        'No anime yet. Apply supabase/migrations/0002_add_anime_kind.sql, then run `npm run import:anime`.',
    },
  },
  {
    id: 'sports',
    label: 'Sports',
    title: 'Live & Upcoming Sport',
    catalog: {
      categoryKind: 'sports',
      cardVariant: 'poster',
      load: limit => fetchSportsEvents({ limit }),
      countNoun: ['event', 'events'],
      emptyMessage:
        'No live or upcoming fixtures. Finished events are filtered out, so this empties itself over time.',
    },
  },
];

/** Narrows a tab to one that browses a catalog. */
export function isCatalogTab(tab: TabDef): tab is CatalogTab {
  return tab.catalog !== null;
}

/** The tabs that browse a catalog, i.e. everything except Home. */
export function catalogTabs(): CatalogTab[] {
  return TABS.filter(isCatalogTab);
}

/** `${n} channel` / `${n} channels`, from a spec's `countNoun`. */
export function formatCount(
  count: number,
  [singular, plural]: CatalogSpec['countNoun'],
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
