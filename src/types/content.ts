import type { CategoryRow, ChannelRow, StreamProtocol } from './database';

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
  season?: number;
  episodeNumber?: number;
  seriesTitle?: string;
  movieboxSubjectId?: string;
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

export interface Season {
  season: number;
  episodes: ContentItem[];
}

