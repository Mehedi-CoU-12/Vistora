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





const MOVIE_COLUMNS =
  'id, slug, title, description, poster_url, backdrop_url, stream_url, stream_protocol, release_year, duration_seconds, content_rating, category_id, sort_order, is_active, created_at, updated_at';

const MOVIE_SEARCH_COLUMNS = ['title', 'description'] as const;











export async function fetchMovies(
  options: {
    categoryKind?: MovieCategoryKind;
    





    categoryId?: string;
    limit?: number;
    search?: string;
  } = {},
): Promise<ContentItem[]> {
  const { categoryKind, categoryId, limit, search } = options;

  const rows = await selectRows<MovieRow>(() => {
    
    
    
    const base = categoryKind
      ? supabase
          .from('movies')
          .select(`${MOVIE_COLUMNS}, categories!inner(kind)`)
          .eq('categories.kind', categoryKind)
      : supabase.from('movies').select(MOVIE_COLUMNS);

    
    
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





const SERIES_COLUMNS =
  'id, slug, title, description, poster_url, backdrop_url, release_year, content_rating, source, source_id, episode_count, category_id, sort_order, is_active, created_at, updated_at';












const SERIES_SEARCH_COLUMNS = ['title', 'description'] as const;

const EPISODE_COLUMNS =
  'id, series_id, slug, title, description, thumbnail_url, stream_url, stream_protocol, stream_headers, season, episode_number, duration_seconds, air_date, is_active, created_at, updated_at';





export async function fetchSeries(
  options: {
    categoryKind?: MovieCategoryKind;
    
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





const EVENT_COLUMNS =
  'id, slug, title, sport_slug, competition, home_team, away_team, description, poster_url, stream_url, stream_protocol, starts_at, ends_at, status, category_id, is_active, created_at, updated_at';








const EVENT_SEARCH_COLUMNS = [
  'title',
  'competition',
  'home_team',
  'away_team',
] as const;


export async function fetchSportsEvents(
  options: { limit?: number; search?: string } = {},
): Promise<ContentItem[]> {
  const rows = await selectRows<SportsEventRow>(() => {
    
    
    
    
    
    
    
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

























export async function fetchRelated(
  item: ContentItem,
  limit = 20,
): Promise<ContentItem[]> {
  if (item.categoryId === null) {
    return [];
  }

  const neighbours = await relatedByKind(item, item.categoryId, limit);

  
  
  
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

    
    
    
    case 'episode':
    case 'sports_event':
      return Promise.resolve([]);
  }
}
