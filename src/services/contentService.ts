import { configError } from '../config/env';
import { supabase } from '../lib/supabase';
import {
  detailBackdrop,
  detailToSubject,
  episodeItem,
  seasonsFromPayload,
  subjectToContentItem,
} from './moviebox/adapt';
import {
  ANIME_KEYWORDS,
  BROAD_KEYWORDS,
  CARTOON_KEYWORDS,
  fetchSeasons,
  fetchSubjectDetail,
  fetchTrending,
  deriveKeywords,
  loadCataloguePage,
  searchCatalogue,
  searchMany,
  startCursor,
  trendingCached,
  type CatalogueCursor,
} from './moviebox/catalogue';
import type {
  Category,
  ContentItem,
  ContentKind,
  Season,
} from '../types/content';
import { channelToContentItem } from '../types/content';
import type { CategoryRow, ChannelRow } from '../types/database';
import { AppError, toAppError } from './errors';
import { ilikeFilter } from './searchQuery';

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
  if (/jwt|api key/i.test(message)) {
    return "The server rejected this app's credentials. Check SUPABASE_ANON_KEY in .env.";
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'The database tables are missing. Apply supabase/migrations/0001_initial_schema.sql to your project.';
  }
  return message;
}

const CHANNEL_COLUMNS =
  'id, slug, name, description, logo_url, stream_url, stream_protocol, stream_headers, category_id, channel_number, sort_order, is_active, created_at, updated_at';

const CHANNEL_SEARCH_COLUMNS = ['name', 'description'] as const;

export async function fetchChannels(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const rows = await selectRows<ChannelRow>(() => {
    const active = supabase
      .from('channels')
      .select(CHANNEL_COLUMNS)

      .eq('is_active', true);

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

function limited(items: ContentItem[], limit?: number): ContentItem[] {
  return limit === undefined ? items : items.slice(0, limit);
}

/** One page of a catalogue grid, plus where to resume. */
export interface ContentPage {
  items: ContentItem[];

  cursor: CatalogueCursor | null;

  /** True once the source has nothing further to give. */
  done: boolean;
}

export const FULL_PAGE: Omit<ContentPage, 'items'> = {
  cursor: null,
  done: true,
};

interface FeedSpec {
  keywords: readonly string[];

  /**
   * Restrict the feed to one kind. Omitted for anime and cartoons, whose
   * keywords intentionally match both films and series.
   */
  kind?: ContentKind;

  /** Seed the first page from the curated home payload where it helps. */
  seedFromTrending?: boolean;
}

/**
 * Pages a keyword feed. The first call optionally seeds from the home tab —
 * a fixed payload that does not page — and hands off to keyword search from
 * there, which is the only endpoint that does.
 */
/**
 * The keyword list a feed pages through.
 *
 * For the movie and series feeds this is seeded from the titles the catalogue
 * actually returned, which are known to match, with the static list appended
 * as a backstop. The home payload is fixed for the session, so this list is
 * stable — which matters, because a cursor addresses a keyword by index.
 */
async function feedKeywords(spec: FeedSpec): Promise<readonly string[]> {
  if (!spec.seedFromTrending) {
    return spec.keywords;
  }

  const curated = await trendingCached().catch(() => [] as ContentItem[]);

  if (curated.length === 0) {
    return spec.keywords;
  }

  const derived = deriveKeywords(curated);
  const known = new Set(derived);

  return [...derived, ...spec.keywords.filter(word => !known.has(word))];
}

async function loadFeedPage(
  spec: FeedSpec,
  cursor: CatalogueCursor | null,
  seen: ReadonlySet<string>,
): Promise<ContentPage> {
  if (cursor === null && spec.seedFromTrending) {
    const curated = await trendingCached().catch(() => [] as ContentItem[]);

    const items = curated.filter(
      item =>
        !seen.has(item.id) &&
        (spec.kind === undefined || item.kind === spec.kind),
    );

    if (items.length > 0) {
      return { items, cursor: startCursor(), done: false };
    }
  }

  try {
    return await loadCataloguePage(await feedKeywords(spec), cursor, {
      kind: spec.kind,
      seen,
    });
  } catch (error) {
    throw toAppError(error);
  }
}

const MOVIE_FEED: FeedSpec = {
  keywords: BROAD_KEYWORDS,
  kind: 'movie',
  seedFromTrending: true,
};

const SERIES_FEED: FeedSpec = {
  keywords: BROAD_KEYWORDS,
  kind: 'series',
  seedFromTrending: true,
};

const ANIME_FEED: FeedSpec = { keywords: ANIME_KEYWORDS };

const CARTOON_FEED: FeedSpec = { keywords: CARTOON_KEYWORDS };

export function fetchMoviePage(
  cursor: CatalogueCursor | null,
  seen: ReadonlySet<string>,
): Promise<ContentPage> {
  return loadFeedPage(MOVIE_FEED, cursor, seen);
}

export function fetchSeriesPage(
  cursor: CatalogueCursor | null,
  seen: ReadonlySet<string>,
): Promise<ContentPage> {
  return loadFeedPage(SERIES_FEED, cursor, seen);
}

export function fetchAnimePage(
  cursor: CatalogueCursor | null,
  seen: ReadonlySet<string>,
): Promise<ContentPage> {
  return loadFeedPage(ANIME_FEED, cursor, seen);
}

export function fetchCartoonPage(
  cursor: CatalogueCursor | null,
  seen: ReadonlySet<string>,
): Promise<ContentPage> {
  return loadFeedPage(CARTOON_FEED, cursor, seen);
}

export async function fetchChannelPage(): Promise<ContentPage> {
  // Channels come from our own table in one shot, so there is nothing to page.
  return { items: await fetchChannels(), ...FULL_PAGE };
}

async function fetchOfKind(
  kind: ContentKind,
  options: { limit?: number; search?: string },
): Promise<ContentItem[]> {
  const { limit, search } = options;

  const items =
    search === undefined || search === ''
      ? (await fetchTrending()).filter(item => item.kind === kind)
      : (await searchCatalogue(search)).filter(item => item.kind === kind);

  return limited(items, limit);
}

export function fetchMovies(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  return fetchOfKind('movie', options);
}

export function fetchSeries(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  return fetchOfKind('series', options);
}

export async function fetchAnime(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const { limit, search } = options;

  const items =
    search === undefined || search === ''
      ? await searchMany(ANIME_KEYWORDS)
      : await searchCatalogue(search);

  return limited(items, limit);
}

export async function fetchCartoons(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const { limit, search } = options;

  const items =
    search === undefined || search === ''
      ? await searchMany(CARTOON_KEYWORDS)
      : await searchCatalogue(search);

  return limited(items, limit);
}

export interface SeriesDetail {
  id: string;
  title: string;
  description?: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  subtitle?: string;
  seasons: Season[];
  episodeCount: number;
}

export async function fetchSeriesDetail(
  subjectId: string,
): Promise<SeriesDetail> {
  const [detail, seasonInfo] = await Promise.all([
    fetchSubjectDetail(subjectId),
    fetchSeasons(subjectId),
  ]);

  const subject = detailToSubject(detail, subjectId);

  if (subject === null) {
    throw new AppError(
      'notFound',
      'This series is no longer available. It may have been removed from the catalogue.',
    );
  }

  const card = subjectToContentItem(subject);
  const backdropUrl = detailBackdrop(detail);

  const seasons: Season[] = seasonsFromPayload(seasonInfo).map(entry => ({
    season: entry.season,
    episodes: Array.from({ length: entry.episodeCount }, (_unused, index) =>
      episodeItem(subjectId, card.title, entry.season, index + 1, backdropUrl),
    ),
  }));

  return {
    id: subjectId,
    title: card.title,
    description: card.description,
    posterUrl: card.imageUrl,
    backdropUrl,
    subtitle: card.meta?.genre,
    seasons,
    episodeCount: seasons.reduce(
      (total, season) => total + season.episodes.length,
      0,
    ),
  };
}

export async function fetchRelated(
  item: ContentItem,
  limit: number,
): Promise<ContentItem[]> {
  const keyword = item.meta?.genre ?? item.title;
  const items = await searchCatalogue(keyword);

  return items.filter(candidate => candidate.id !== item.id).slice(0, limit);
}

const CATEGORY_COLUMNS = 'id, slug, name, kind';

export async function fetchCategories(
  kind: CategoryRow['kind'],
): Promise<Category[]> {
  if (kind !== 'live_tv') {
    return [];
  }

  const rows = await selectRows<CategoryRow>(() =>
    supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('kind', kind)
      .order('sort_order', { ascending: true }),
  );

  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
  }));
}
