import type {
  CategoryRow,
  ChannelRow,
  EpisodeRow,
  EventStatus,
  MovieRow,
  SeriesRow,
  SportsEventRow,
  StreamProtocol,
} from './database';











export type ContentKind =
  | 'channel'
  | 'movie'
  | 'sports_event'
  




  | 'series'
  | 'episode';











export type PlayableProtocol = Exclude<StreamProtocol, 'youtube'>;








export interface Stream {
  url: string;
  protocol: PlayableProtocol;
  
  headers?: Record<string, string>;
  



  isLive: boolean;
}


export interface ContentItem {
  id: string;
  kind: ContentKind;
  title: string;
  
  subtitle?: string;
  imageUrl: string | null;
  














  backdropUrl: string | null;
  
  badge?: string;
  



  categoryId: string | null;
  








  stream: Stream | null;
  




  unavailableLabel?: string;
  description?: string;
  














  meta?: ContentMeta;
}


export interface ContentMeta {
  year?: number;
  
  duration?: string;
  
  genre?: string;
  
  rating?: string;
  
  quality?: string;
}









export function metaParts(meta: ContentMeta | undefined): string[] {
  if (!meta) {
    return [];
  }

  return [
    meta.year === undefined ? null : String(meta.year),
    meta.genre ?? null,
    meta.rating ?? null,
    meta.duration ?? null,
    meta.quality ?? null,
  ].filter((part): part is string => part !== null && part !== '');
}

export type Category = Pick<CategoryRow, 'id' | 'slug' | 'name' | 'kind'>;












interface StreamColumns {
  stream_url: string | null;
  stream_protocol: StreamProtocol;
  stream_headers?: Record<string, string> | null;
}






















function toStream(row: StreamColumns, isLive: boolean): Stream | null {
  if (row.stream_url === null || row.stream_protocol === 'youtube') {
    return null;
  }

  return {
    url: row.stream_url,
    protocol: row.stream_protocol,
    headers: row.stream_headers ?? undefined,
    isLive,
  };
}









function unavailableLabelFor(row: StreamColumns): string | undefined {
  if (row.stream_url === null) {
    return 'Not started';
  }

  return row.stream_protocol === 'youtube' ? 'Unavailable' : undefined;
}

export function channelToContentItem(row: ChannelRow): ContentItem {
  return {
    id: row.id,
    kind: 'channel',
    title: row.name,
    subtitle:
      row.channel_number !== null ? `Channel ${row.channel_number}` : undefined,
    imageUrl: row.logo_url,
    
    
    
    
    backdropUrl: null,
    badge: 'LIVE',
    categoryId: row.category_id,
    description: row.description ?? undefined,
    
    
    
    
    
    stream: toStream(row, true),
    unavailableLabel: unavailableLabelFor(row),
  };
}

export function movieToContentItem(row: MovieRow): ContentItem {
  return {
    id: row.id,
    kind: 'movie',
    title: row.title,
    subtitle:
      [row.release_year, formatDuration(row.duration_seconds)]
        .filter(Boolean)
        .join(' · ') || undefined,
    imageUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    meta: {
      year: row.release_year ?? undefined,
      duration: formatDuration(row.duration_seconds) ?? undefined,
      rating: row.content_rating ?? undefined,
    },
    stream: toStream(row, false),
    unavailableLabel: unavailableLabelFor(row),
  };
}

export function sportsEventToContentItem(row: SportsEventRow): ContentItem {
  const isLive = row.status === 'live';

  return {
    id: row.id,
    kind: 'sports_event',
    title: row.title,
    subtitle: eventSubtitle(row),
    imageUrl: row.poster_url,
    
    
    
    backdropUrl: row.poster_url,
    badge: isLive ? 'LIVE' : undefined,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    meta: { genre: row.competition ?? undefined },
    
    
    
    stream: toStream(row, isLive),
    
    
    unavailableLabel: unavailableLabelFor(row),
  };
}

export function seriesToContentItem(row: SeriesRow): ContentItem {
  return {
    id: row.id,
    kind: 'series',
    title: row.title,
    subtitle:
      [
        row.release_year,
        row.episode_count > 0 ? formatEpisodeCount(row.episode_count) : null,
      ]
        .filter(Boolean)
        .join(' \u00b7 ') || undefined,
    imageUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    meta: {
      year: row.release_year ?? undefined,
      rating: row.content_rating ?? undefined,
      duration:
        row.episode_count > 0
          ? formatEpisodeCount(row.episode_count)
          : undefined,
    },
    
    
    stream: null,
  };
}

export function episodeToContentItem(row: EpisodeRow): ContentItem {
  return {
    id: row.id,
    kind: 'episode',
    title: row.title,
    subtitle: formatDuration(row.duration_seconds) ?? undefined,
    imageUrl: row.thumbnail_url,
    
    
    backdropUrl: row.thumbnail_url,
    
    
    badge: `E${row.episode_number}`,
    
    
    
    categoryId: null,
    description: row.description ?? undefined,
    meta: { duration: formatDuration(row.duration_seconds) ?? undefined },
    stream: toStream(row, false),
    unavailableLabel: unavailableLabelFor(row),
  };
}









export interface Season {
  season: number;
  episodes: ContentItem[];
}









export function groupEpisodesBySeason(rows: EpisodeRow[]): Season[] {
  const bySeason = new Map<number, EpisodeRow[]>();

  for (const row of rows) {
    const bucket = bySeason.get(row.season);
    if (bucket) {
      bucket.push(row);
    } else {
      bySeason.set(row.season, [row]);
    }
  }

  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, episodes]) => ({
      season,
      episodes: episodes
        .slice()
        .sort((a, b) => a.episode_number - b.episode_number)
        .map(episodeToContentItem),
    }));
}






function formatEpisodeCount(count: number): string {
  return `${count} ${count === 1 ? 'episode' : 'episodes'}`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) {
    return null;
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function eventSubtitle(row: SportsEventRow): string | undefined {
  const parts: string[] = [];

  if (row.competition) {
    parts.push(row.competition);
  }

  parts.push(eventTimeLabel(row.starts_at, row.status));

  return parts.join(' · ');
}

function eventTimeLabel(startsAt: string, status: EventStatus): string {
  if (status === 'live') {
    return 'On now';
  }
  if (status === 'finished') {
    return 'Full time';
  }
  if (status === 'cancelled' || status === 'postponed') {
    return status === 'cancelled' ? 'Cancelled' : 'Postponed';
  }

  const start = new Date(startsAt);
  const time = start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAway = Math.floor(
    (start.getTime() - startOfToday.getTime()) / 86_400_000,
  );

  if (daysAway <= 0) {
    return `Today ${time}`;
  }
  if (daysAway === 1) {
    return `Tomorrow ${time}`;
  }

  return `${start.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} ${time}`;
}
