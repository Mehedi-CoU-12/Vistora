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
  CARTOON_KEYWORDS,
  fetchSeasons,
  fetchSubjectDetail,
  fetchTrending,
  searchCatalogue,
  searchMany,
} from './moviebox/catalogue';
import type { Category, ContentItem, Season } from '../types/content';
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

export async function fetchMovies(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const { limit, search } = options;

  const items =
    search === undefined || search === ''
      ? (await fetchTrending()).filter(item => item.kind === 'movie')
      : await searchCatalogue(search);

  return limited(items, limit);
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
