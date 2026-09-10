import {configError} from '../config/env';
import {supabase} from '../lib/supabase';
import type {Category, ContentItem} from '../types/content';
import {
  channelToContentItem,
  movieToContentItem,
  sportsEventToContentItem,
} from '../types/content';
import type {
  CategoryRow,
  ChannelRow,
  MovieCategoryKind,
  MovieRow,
  SportsEventRow,
} from '../types/database';
import {AppError, toAppError} from './errors';

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
 */

/**
 * Wraps a Supabase query with the three things every read needs: a
 * configuration check, error normalisation, and a null-safe array.
 *
 * Doing it here is what keeps each query below down to a few readable lines,
 * and guarantees no screen can accidentally skip the config check.
 */
async function selectRows<Row>(
  run: () => PromiseLike<{data: Row[] | null; error: {message: string} | null}>,
): Promise<Row[]> {
  if (configError) {
    throw new AppError('config', configError);
  }

  try {
    const {data, error} = await run();

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
    return 'The server rejected this app\'s credentials. Check SUPABASE_ANON_KEY in .env.';
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

export async function fetchChannels(options: {limit?: number} = {}): Promise<ContentItem[]> {
  const rows = await selectRows<ChannelRow>(() => {
    const query = supabase
      .from('channels')
      .select(CHANNEL_COLUMNS)
      // `is_active` is enforced by the RLS policy too. Repeating it here is not
      // redundant: it lets PostgreSQL use the partial index on active rows.
      .eq('is_active', true)
      .order('sort_order', {ascending: true})
      .order('name', {ascending: true});

    return options.limit ? query.limit(options.limit) : query;
  });

  return rows.map(channelToContentItem);
}

export async function fetchChannelsByCategory(categoryId: string): Promise<ContentItem[]> {
  const rows = await selectRows<ChannelRow>(() =>
    supabase
      .from('channels')
      .select(CHANNEL_COLUMNS)
      .eq('is_active', true)
      .eq('category_id', categoryId)
      .order('sort_order', {ascending: true}),
  );

  return rows.map(channelToContentItem);
}

// ---------------------------------------------------------------------------
// Movies, cartoons and anime
// ---------------------------------------------------------------------------

const MOVIE_COLUMNS =
  'id, slug, title, description, poster_url, backdrop_url, stream_url, stream_protocol, release_year, duration_seconds, content_rating, category_id, sort_order, is_active, created_at, updated_at';

/**
 * `categoryKind` filters via the related category rather than a column on
 * `movies`, which is what lets cartoons and anime share the movies table: they
 * are simply titles whose category has kind = 'cartoon' or 'anime'.
 */
export async function fetchMovies(
  options: {categoryKind?: MovieCategoryKind; limit?: number} = {},
): Promise<ContentItem[]> {
  const {categoryKind, limit} = options;

  const rows = await selectRows<MovieRow>(() => {
    // `categories!inner(kind)` turns the category relation into an INNER JOIN,
    // which is what makes `.eq('categories.kind', ...)` filter the movies rather
    // than just the embedded object.
    const query = categoryKind
      ? supabase
          .from('movies')
          .select(`${MOVIE_COLUMNS}, categories!inner(kind)`)
          .eq('categories.kind', categoryKind)
      : supabase.from('movies').select(MOVIE_COLUMNS);

    const ordered = query
      .eq('is_active', true)
      .order('sort_order', {ascending: true})
      .order('title', {ascending: true});

    return limit ? ordered.limit(limit) : ordered;
  });

  return rows.map(movieToContentItem);
}

// ---------------------------------------------------------------------------
// Sports events
// ---------------------------------------------------------------------------

const EVENT_COLUMNS =
  'id, slug, title, sport_slug, competition, home_team, away_team, description, poster_url, stream_url, stream_protocol, starts_at, ends_at, status, category_id, is_active, created_at, updated_at';

/** Live now first, then the soonest upcoming fixtures. */
export async function fetchSportsEvents(options: {limit?: number} = {}): Promise<ContentItem[]> {
  const rows = await selectRows<SportsEventRow>(() => {
    // Ordering by starts_at ascending gives "live first, then soonest upcoming"
    // for free: a live event started in the past, a scheduled one starts in the
    // future, and finished events are filtered out.
    //
    // Do NOT be tempted to .order('status') here. PostgreSQL sorts an enum by
    // its declaration order, and event_status is declared with 'scheduled'
    // before 'live', so that would sort upcoming fixtures above live ones.
    const query = supabase
      .from('sports_events')
      .select(EVENT_COLUMNS)
      .eq('is_active', true)
      .in('status', ['live', 'scheduled'])
      .order('starts_at', {ascending: true});

    return options.limit ? query.limit(options.limit) : query;
  });

  return rows.map(sportsEventToContentItem);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function fetchCategories(kind?: CategoryRow['kind']): Promise<Category[]> {
  const rows = await selectRows<CategoryRow>(() => {
    const query = supabase
      .from('categories')
      .select('id, slug, name, kind')
      .eq('is_active', true)
      .order('sort_order', {ascending: true});

    return kind ? query.eq('kind', kind) : query;
  });

  return rows.map(({id, slug, name, kind: rowKind}) => ({id, slug, name, kind: rowKind}));
}
