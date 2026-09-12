import { configError } from '../config/env';
import { supabase } from '../lib/supabase';
import type { Category, ContentItem, Season } from '../types/content';
import {
  channelToContentItem,
  groupEpisodesBySeason,
  movieToContentItem,
  seriesToContentItem,
  sportsEventToContentItem,
} from '../types/content';
import type {
  CategoryRow,
  ChannelRow,
  EpisodeRow,
  MovieCategoryKind,
  MovieRow,
  SeriesRow,
  SportsEventRow,
} from '../types/database';
import { AppError, toAppError } from './errors';
import { ilikeFilter } from './searchQuery';

/**
 * Every read the app performs, in one file.
 *
 * The rest of the app calls these functions and receives app models
 * (`ContentItem`, `Category`) or an `AppError`. Nothing outside this file
 * imports `supabase`, so swapping the backend, or adding caching, happens here
 * and nowhere else.
 *
 * On the video architecture: these queries return a `stream_url` STRING. That is
 * the entire extent of Supabase's involvement in playback. The bytes travel
 * from the CDN straight to the device -- never through Supabase, never through
 * an Edge Function, never through a server we run.
 *
 * ---------------------------------------------------------------------------
 * `search` is an option on every fetcher, not a `searchEverything()`
 * ---------------------------------------------------------------------------
 * The obvious shape for a search feature is one function that queries all three
 * tables and returns a flat list. It is the wrong one here, because the three
 * tables are not interchangeable: a channel is a 16:9 tile and a film is a
 * poster, and cartoons and anime are `movies` rows told apart only by their
 * category's kind -- so a flat list would have to be re-grouped by the UI, using
 * a second copy of the knowledge already written down in `navigation/tabs.ts`.
 *
 * Instead each fetcher takes an optional `search`, and the tab definitions --
 * already the single list of what this app browses -- carry the loader that
 * applies it. `SearchScreen` then searches by mapping over the same array
 * `HomeScreen` builds its shelves from, so a new content kind becomes
 * searchable at the moment it becomes browsable, with no list to keep in step.
 */

/**
 * Wraps a Supabase query with the three things every read needs: a
 * configuration check, error normalisation, and a null-safe array.
 *
 * Doing it here is what keeps each query below down to a few readable lines,
 * and guarantees no screen can accidentally skip the config check.
 */
async function selectRows<Row>(
  run: () => PromiseLike<{
    data: Row[] | null;
    error: { message: string } | null;
  }>,
): Promise<Row[]> {
  if (configError) {
    throw new AppError('config', configError);
  }

  try {
    const { data, error } = await run();

    if (error) {
      throw new AppError('network', supabaseMessage(error.message), error);
    }

    return data ?? [];
  } catch (error) {
    throw toAppError(error);
  }
}

function supabaseMessage(message: string): string {
  // A wrong anon key is the single most common setup mistake, and Supabase's own
  // wording ("Invalid API key") does not hint at where to fix it.
  if (/jwt|api key/i.test(message)) {
    return "The server rejected this app's credentials. Check SUPABASE_ANON_KEY in .env.";
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'The database tables are missing. Apply supabase/migrations/0001_initial_schema.sql to your project.';
  }
  return message;
}

// ---------------------------------------------------------------------------
// Channels (Live TV)
// ---------------------------------------------------------------------------

const CHANNEL_COLUMNS =
  'id, slug, name, description, logo_url, stream_url, stream_protocol, stream_headers, category_id, channel_number, sort_order, is_active, created_at, updated_at';

/**
 * A channel's searchable text.
 *
 * `channel_number` is deliberately absent. It is an integer column, and asking
 * PostgREST for `ilike` on one is a cast away from a 400 -- and someone hunting
 * for channel 101 has the Live TV grid, which is ordered by exactly that number.
 */
const CHANNEL_SEARCH_COLUMNS = ['name', 'description'] as const;

export async function fetchChannels(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const rows = await selectRows<ChannelRow>(() => {
    const active = supabase
      .from('channels')
      .select(CHANNEL_COLUMNS)
      // `is_active` is enforced by the RLS policy too. Repeating it here is not
      // redundant: it lets PostgreSQL use the partial index on active rows.
      .eq('is_active', true);

    // `.or()` before the ordering rather than after, so the sort applies to the
    // matched set. Chaining it afterwards would work too -- PostgREST builds a
    // query string, not a pipeline -- but reading filters-then-order top to
    // bottom is what stops someone "tidying" a filter below a `.limit()`, where
    // it really would change the answer.
    const matched = options.search
      ? active.or(ilikeFilter(CHANNEL_SEARCH_COLUMNS, options.search))
      : active;

    const query = matched
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    return options.limit ? query.limit(options.limit) : query;
  });

  return rows.map(channelToContentItem);
}

export async function fetchChannelsByCategory(
  categoryId: string,
): Promise<ContentItem[]> {
  const rows = await selectRows<ChannelRow>(() =>
    supabase
      .from('channels')
      .select(CHANNEL_COLUMNS)
      .eq('is_active', true)
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: true }),
  );

  return rows.map(channelToContentItem);
}

// ---------------------------------------------------------------------------
// Movies, cartoons and anime
// ---------------------------------------------------------------------------

const MOVIE_COLUMNS =
  'id, slug, title, description, poster_url, backdrop_url, stream_url, stream_protocol, release_year, duration_seconds, content_rating, category_id, sort_order, is_active, created_at, updated_at';

const MOVIE_SEARCH_COLUMNS = ['title', 'description'] as const;

/**
 * `categoryKind` filters via the related category rather than a column on
 * `movies`, which is what lets cartoons and anime share the movies table: they
 * are simply titles whose category has kind = 'cartoon' or 'anime'.
 *
 * That is also why `search` names only columns on `movies` itself. The kind
 * filter is an INNER JOIN condition and the search is a disjunction; putting an
 * embedded column inside the `or` would make the whole `or` apply to the join
 * instead, so a cartoon search would start returning films.
 */
export async function fetchMovies(
  options: {
    categoryKind?: MovieCategoryKind;
    /**
     * One specific category, by id. Used by "More like this", which already has
     * the id from the item it is finding neighbours for -- so filtering by kind
     * and then discarding nine categories client-side would be a bigger query
     * for a smaller answer.
     */
    categoryId?: string;
    limit?: number;
    search?: string;
  } = {},
): Promise<ContentItem[]> {
  const { categoryKind, categoryId, limit, search } = options;

  const rows = await selectRows<MovieRow>(() => {
    // `categories!inner(kind)` turns the category relation into an INNER JOIN,
    // which is what makes `.eq('categories.kind', ...)` filter the movies rather
    // than just the embedded object.
    const base = categoryKind
      ? supabase
          .from('movies')
          .select(`${MOVIE_COLUMNS}, categories!inner(kind)`)
          .eq('categories.kind', categoryKind)
      : supabase.from('movies').select(MOVIE_COLUMNS);

    // A column on `movies` itself, so this needs no join and composes with the
    // kind filter above rather than replacing it.
    const query = categoryId ? base.eq('category_id', categoryId) : base;

    const matched = search
      ? query.or(ilikeFilter(MOVIE_SEARCH_COLUMNS, search))
      : query;

    const ordered = matched
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    return limit ? ordered.limit(limit) : ordered;
  });

  return rows.map(movieToContentItem);
}

// ---------------------------------------------------------------------------
// Series and episodes
// ---------------------------------------------------------------------------

const SERIES_COLUMNS =
  'id, slug, title, description, poster_url, backdrop_url, release_year, content_rating, source, source_id, episode_count, category_id, sort_order, is_active, created_at, updated_at';

/**
 * A series' searchable text -- and, by omission, a decision about what search
 * means here.
 *
 * Episodes are not searched. They could be: the rows are there and the join is
 * cheap. But a series of seventy-five episodes titles most of them with the
 * series name, so searching them would answer "attack" with one series card and
 * seventy-five near-identical episode cards underneath it, burying every OTHER
 * show that matched. The thing the user is looking for is the show; the episode
 * is one press further in, on a screen built to list them.
 */
const SERIES_SEARCH_COLUMNS = ['title', 'description'] as const;

const EPISODE_COLUMNS =
  'id, series_id, slug, title, description, thumbnail_url, stream_url, stream_protocol, stream_headers, season, episode_number, duration_seconds, air_date, is_active, created_at, updated_at';

/**
 * Series of one kind, for a grid. Mirrors `fetchMovies` exactly -- same inner
 * join onto the category to filter by kind, same reason it cannot be a column.
 */
export async function fetchSeries(
  options: {
    categoryKind?: MovieCategoryKind;
    /** One specific category, by id. See the note on `fetchMovies`. */
    categoryId?: string;
    limit?: number;
    search?: string;
  } = {},
): Promise<ContentItem[]> {
  const { categoryKind, categoryId, limit, search } = options;

  const rows = await selectRows<SeriesRow>(() => {
    const base = categoryKind
      ? supabase
          .from('series')
          .select(`${SERIES_COLUMNS}, categories!inner(kind)`)
          .eq('categories.kind', categoryKind)
      : supabase.from('series').select(SERIES_COLUMNS);

    const query = categoryId ? base.eq('category_id', categoryId) : base;

    const matched = search
      ? query.or(ilikeFilter(SERIES_SEARCH_COLUMNS, search))
      : query;

    const ordered = matched
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });

    return limit ? ordered.limit(limit) : ordered;
  });

  return rows.map(seriesToContentItem);
}

/** Everything `SeriesScreen` renders. */
export interface SeriesDetail {
  id: string;
  title: string;
  description?: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** "2021 · 24 episodes", built by the same mapper the grid card uses. */
  subtitle?: string;
  seasons: Season[];
  /** Total across every season, for the heading. */
  episodeCount: number;
}

/**
 * One series and its episodes, in two queries fired together.
 *
 * Not one query with an embedded `episodes(...)`. PostgREST would happily do
 * it, and it would put the ordering of the episode list inside a nested
 * resource where `order` applies per-parent and is the single easiest thing to
 * get wrong here -- an episode list in the wrong order is a bug you only notice
 * at episode 10, next to episode 1. Two flat queries in a `Promise.all` cost
 * one round trip between them and keep the ordering somewhere obvious.
 */
export async function fetchSeriesDetail(
  seriesId: string,
): Promise<SeriesDetail> {
  const [seriesRows, episodeRows] = await Promise.all([
    selectRows<SeriesRow>(() =>
      supabase
        .from('series')
        .select(SERIES_COLUMNS)
        .eq('id', seriesId)
        .eq('is_active', true)
        .limit(1),
    ),
    selectRows<EpisodeRow>(() =>
      supabase
        .from('episodes')
        .select(EPISODE_COLUMNS)
        .eq('series_id', seriesId)
        .eq('is_active', true)
        .order('season', { ascending: true })
        .order('episode_number', { ascending: true }),
    ),
  ]);

  const row = seriesRows[0];

  // `.limit(1)` rather than `.single()`, so "no such series" arrives here as an
  // empty array instead of as a PostgREST error the catch-all would relabel
  // "Something went wrong". A series can legitimately vanish between the grid
  // being loaded and a card being selected -- it was deactivated -- and that
  // deserves its own sentence and no Retry button.
  if (!row) {
    throw new AppError(
      'notFound',
      'This series is no longer available. It may have been removed from the library.',
    );
  }

  const card = seriesToContentItem(row);

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    subtitle: card.subtitle,
    seasons: groupEpisodesBySeason(episodeRows),
    episodeCount: episodeRows.length,
  };
}

/**
 * The Anime tab: series and standalone films, in one list.
 *
 * Both, rather than only series, because both genuinely exist and dropping
 * either would lose content that is already imported. `scripts/import-anime.mjs`
 * writes series of YouTube episodes; `import-archive.mjs --kind=anime` writes
 * the handful of public-domain anime FILMS, which have no episodes and are not
 * series in any useful sense. A tab that showed one and not the other would be
 * a tab that lies about what is in the library.
 *
 * They interleave rather than appearing in two blocks: `sort_order` is assigned
 * by the importers and `title` breaks the tie, so the grid reads as one
 * alphabetised catalogue. The card tells you which is which without a label --
 * a series card carries an episode count and opens a list.
 *
 * The `limit` is applied per source and then again to the merged list, which is
 * not redundant: without the second application a home shelf asking for 12
 * would receive up to 24.
 */
export async function fetchAnime(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const [series, films] = await Promise.all([
    fetchSeries({ ...options, categoryKind: 'anime' }),
    fetchMovies({ ...options, categoryKind: 'anime' }),
  ]);

  const merged = [...series, ...films].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return options.limit ? merged.slice(0, options.limit) : merged;
}

// ---------------------------------------------------------------------------
// Sports events
// ---------------------------------------------------------------------------

const EVENT_COLUMNS =
  'id, slug, title, sport_slug, competition, home_team, away_team, description, poster_url, stream_url, stream_protocol, starts_at, ends_at, status, category_id, is_active, created_at, updated_at';

/**
 * A fixture's searchable text: the four ways anyone actually looks for a match.
 *
 * `sport_slug` is left out on purpose -- it is a machine key ('football'), and
 * searching it would make "foot" return every football fixture in the database,
 * burying the one team the user typed half of.
 */
const EVENT_SEARCH_COLUMNS = [
  'title',
  'competition',
  'home_team',
  'away_team',
] as const;

/** Live now first, then the soonest upcoming fixtures. */
export async function fetchSportsEvents(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const rows = await selectRows<SportsEventRow>(() => {
    // Ordering by starts_at ascending gives "live first, then soonest upcoming"
    // for free: a live event started in the past, a scheduled one starts in the
    // future, and finished events are filtered out.
    //
    // Do NOT be tempted to .order('status') here. PostgreSQL sorts an enum by
    // its declaration order, and event_status is declared with 'scheduled'
    // before 'live', so that would sort upcoming fixtures above live ones.
    const upcoming = supabase
      .from('sports_events')
      .select(EVENT_COLUMNS)
      .eq('is_active', true)
      .in('status', ['live', 'scheduled']);

    const matched = options.search
      ? upcoming.or(ilikeFilter(EVENT_SEARCH_COLUMNS, options.search))
      : upcoming;

    const query = matched.order('starts_at', { ascending: true });

    return options.limit ? query.limit(options.limit) : query;
  });

  return rows.map(sportsEventToContentItem);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function fetchCategories(
  kind?: CategoryRow['kind'],
): Promise<Category[]> {
  const rows = await selectRows<CategoryRow>(() => {
    const query = supabase
      .from('categories')
      .select('id, slug, name, kind')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    return kind ? query.eq('kind', kind) : query;
  });

  return rows.map(({ id, slug, name, kind: rowKind }) => ({
    id,
    slug,
    name,
    kind: rowKind,
  }));
}

// ---------------------------------------------------------------------------
// Related content
// ---------------------------------------------------------------------------

/**
 * Neighbours of an item, for the "More like this" rail on a details screen.
 *
 * ---------------------------------------------------------------------------
 * "Like this" means "filed next to this", and says so
 * ---------------------------------------------------------------------------
 * This is not a recommender and does not pretend to be one. It returns other
 * things in the same category, ordered the way that category is ordered
 * everywhere else in the app -- which for a library organised by hand is a
 * genuinely useful answer, and is the only honest one available without watch
 * history, ratings or embeddings, none of which exist here.
 *
 * Naming it `fetchRelated` rather than `fetchRecommended` is part of that: a
 * function called "recommended" invites somebody to quietly add scoring to it
 * later and leaves every caller claiming something the data cannot support.
 *
 * Returns an empty list rather than throwing when there is nothing to relate to
 * -- an uncategorised item, a kind with no sibling table. A details screen with
 * no rail underneath it is a complete screen; an error there is not.
 */
export async function fetchRelated(
  item: ContentItem,
  limit = 20,
): Promise<ContentItem[]> {
  if (item.categoryId === null) {
    return [];
  }

  const neighbours = await relatedByKind(item, item.categoryId, limit);

  // The item itself is in its own category, and a rail that offers you the
  // thing you are already looking at reads as a bug. Fetching `limit + 1` and
  // trimming after keeps the rail full when the item is inside the window.
  return neighbours.filter(other => other.id !== item.id).slice(0, limit);
}

function relatedByKind(
  item: ContentItem,
  categoryId: string,
  limit: number,
): Promise<ContentItem[]> {
  switch (item.kind) {
    case 'channel':
      return fetchChannelsByCategory(categoryId);

    case 'movie':
      return fetchMovies({ categoryId, limit: limit + 1 });

    case 'series':
      return fetchSeries({ categoryId, limit: limit + 1 });

    // An episode's neighbours are the other episodes, which the series screen
    // is already showing in full -- so a rail here would be the list above it,
    // shuffled into cards. A fixture has no sibling query worth making.
    case 'episode':
    case 'sports_event':
      return Promise.resolve([]);
  }
}
