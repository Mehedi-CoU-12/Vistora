import {
  fetchAnime,
  fetchChannels,
  fetchMovies,
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
 * as a near-identical screen component per kind means `CatalogScreen` is
 * written once, and adding a content kind is an entry in this array.
 *
 * It also removes a class of bug the previous shape invited. The home screen
 * used to hard-code its own list of rows, so the set of things on the home
 * screen and the set of things you could browse were two lists that had to be
 * kept in step by hand. Home now derives its shelves from `catalogTabs()`, so a
 * new kind appears in both places or neither. `SearchScreen` derives its result
 * shelves from the same call, which is the third place that would otherwise have
 * needed the same list written out again -- and the one where a stale copy would
 * be hardest to notice, since a kind missing from search looks like a kind with
 * nothing in it.
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

/** What a catalog's loader can be narrowed by. */
export interface CatalogLoadOptions {
  /**
   * Cap on the number of items. Passed by the home screen, which shows a
   * preview of each catalog rather than the whole thing, and by search, which
   * shows a shelf per kind.
   */
  limit?: number;
  /**
   * Substring to match against the kind's own text columns -- a channel's name,
   * a film's title, a fixture's teams. Omitted for a plain browse, which returns
   * the whole catalog.
   *
   * Pass a term that has already been through `normalizeSearchTerm`; see
   * services/searchQuery.ts for what that does and why.
   */
  search?: string;
}

/** A tab that browses one kind of content. */
export interface CatalogSpec {
  /** Which categories become the filter list down the side (or along the top). */
  categoryKind: CategoryKind;
  cardVariant: CardVariant;
  /**
   * Loads the tab's items, optionally capped or filtered by a search term.
   *
   * One loader rather than a `load` and a separate `search` per tab, which is
   * what makes it impossible for browsing a kind and searching it to disagree
   * about what is in it: the Anime tab and an anime search are the same
   * query with one more filter.
   */
  load: (options?: CatalogLoadOptions) => Promise<ContentItem[]>;
  /** Count wording, singular and plural: "1 channel", "42 channels". */
  countNoun: readonly [singular: string, plural: string];
  /** Shown when the query succeeds and comes back empty. */
  emptyMessage: string;
}

export type TabId = 'home' | 'live-tv' | 'movies' | 'anime' | 'cartoons';

export interface TabDef {
  id: TabId;
  /**
   * Nav label. Kept short deliberately: the bar has to survive a 390dp phone
   * in portrait even as kinds are added, so a two-word label is the ceiling.
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
      load: options => fetchChannels(options),
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
      load: options => fetchMovies({ ...options, categoryKind: 'movie' }),
      countNoun: ['film', 'films'],
      emptyMessage:
        'No films yet. Run `npm run import:movies`, then apply the seed file it writes.',
    },
  },
  {
    id: 'anime',
    label: 'Anime',
    title: 'Anime',
    catalog: {
      categoryKind: 'anime',
      cardVariant: 'poster',
      // Series AND films, merged -- see fetchAnime for why the tab would be
      // lying if it showed only one of them. This is the only tab whose loader
      // reads two tables, which is also why it is a named function in the
      // service rather than an inline Promise.all here.
      load: options => fetchAnime(options),
      // "1 anime / 42 animes" is wrong in both directions, so the count says
      // "title" here rather than bending the tab's own name into a plural. It
      // also happens to be the honest noun now that a "title" may be a
      // twenty-six episode series or a single film.
      countNoun: ['title', 'titles'],
      emptyMessage:
        'No anime yet. Apply the migrations in supabase/migrations/, then run `npm run import:anime` and apply the seed file it writes.',
    },
  },
  {
    id: 'cartoons',
    label: 'Cartoons',
    title: 'Cartoons',
    catalog: {
      /**
       * `cartoon` is a `category_kind` that has existed since the first
       * migration, and `import-archive.mjs --kind=cartoon` has been writing rows
       * under it -- but there was no tab, and `fetchMovies({categoryKind:
       * 'movie'})` filters them out of the Movies grid by design. The result was
       * a library whose largest single category was unreachable from anywhere in
       * the app.
       *
       * This is the whole fix: the loader and the screen already existed.
       */
      categoryKind: 'cartoon',
      cardVariant: 'poster',
      load: options => fetchMovies({ ...options, categoryKind: 'cartoon' }),
      countNoun: ['title', 'titles'],
      emptyMessage:
        'No cartoons yet. Run `npm run import:cartoons`, then apply the seed file it writes.',
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

/**
 * The catalog tabs' titles as a readable list: "Live TV, Movies, Anime and
 * Cartoons".
 *
 * Exists so the search screen's placeholder and empty state can name what they
 * search WITHOUT a second copy of the kind list. Both used to read "channels,
 * films and anime", which was a sentence that had to be remembered whenever a
 * kind was added -- and was already wrong the moment Cartoons appeared, in the
 * quietest possible way: the app searched them correctly and told the user it
 * did not.
 */
export function catalogTitleList(): string {
  const titles = catalogTabs().map(tab => tab.title);

  if (titles.length <= 1) {
    return titles[0] ?? 'content';
  }

  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}
