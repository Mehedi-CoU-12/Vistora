import type {
  CategoryRow,
  ChannelRow,
  EventStatus,
  MovieRow,
  SportsEventRow,
  StreamProtocol,
} from './database';

/**
 * The app's own vocabulary, deliberately separate from the database row types.
 *
 * Why bother, when the rows are nearly the same shape? Because the boundary is
 * what keeps the player and the UI independent of PostgreSQL. A card renders a
 * `ContentItem`; the player accepts a `Stream`. Neither has any idea a database
 * exists, so renaming a column touches only the mapper functions below, and the
 * player could be handed a stream from a completely different source tomorrow.
 */

export type ContentKind = 'channel' | 'movie' | 'sports_event';

/**
 * Everything the video player needs, and nothing more.
 *
 * This is the whole contract between the data layer and playback. Note what is
 * absent: no row id, no category, no Supabase anything. See
 * src/player/VideoPlayer.tsx.
 */
export interface Stream {
  url: string;
  protocol: StreamProtocol;
  /** Extra HTTP headers, when a CDN requires them. Usually undefined. */
  headers?: Record<string, string>;
  /**
   * Live streams have no meaningful duration or end, so the player hides the
   * seek bar and shows a LIVE indicator instead.
   */
  isLive: boolean;
}

/** A single card in any row or grid. */
export interface ContentItem {
  id: string;
  kind: ContentKind;
  title: string;
  /** Second line on the card: category, kick-off time, year. */
  subtitle?: string;
  imageUrl: string | null;
  /** Short overlay tag, e.g. 'LIVE' or a channel number. */
  badge?: string;
  /**
   * Kept on the item so screens can filter by category without a second query.
   * Null when the content is uncategorised.
   */
  categoryId: string | null;
  /**
   * Null when the item exists but cannot be played yet -- a fixture whose stream
   * URL has not been published. The UI shows these but does not let you open the
   * player, which is why this is nullable rather than optional.
   */
  stream: Stream | null;
  description?: string;
}

export type Category = Pick<CategoryRow, 'id' | 'slug' | 'name' | 'kind'>;

// ---------------------------------------------------------------------------
// Mappers: database row -> app model
// ---------------------------------------------------------------------------
// The only place in the codebase that knows what a column is called.

export function channelToContentItem(row: ChannelRow): ContentItem {
  return {
    id: row.id,
    kind: 'channel',
    title: row.name,
    subtitle: row.channel_number !== null ? `Channel ${row.channel_number}` : undefined,
    imageUrl: row.logo_url,
    badge: 'LIVE',
    categoryId: row.category_id,
    description: row.description ?? undefined,
    stream: {
      url: row.stream_url,
      protocol: row.stream_protocol,
      headers: row.stream_headers ?? undefined,
      // A TV channel is by definition a continuous live broadcast.
      isLive: true,
    },
  };
}

export function movieToContentItem(row: MovieRow): ContentItem {
  return {
    id: row.id,
    kind: 'movie',
    title: row.title,
    subtitle: [row.release_year, formatDuration(row.duration_seconds)]
      .filter(Boolean)
      .join(' · ') || undefined,
    imageUrl: row.poster_url,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    stream: {
      url: row.stream_url,
      protocol: row.stream_protocol,
      isLive: false,
    },
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
    badge: isLive ? 'LIVE' : undefined,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    // A scheduled fixture usually has no stream URL yet. Returning null (rather
    // than an empty string) makes "not playable" a state the UI must handle
    // explicitly instead of a crash inside the player.
    stream:
      row.stream_url === null
        ? null
        : {url: row.stream_url, protocol: row.stream_protocol, isLive},
  };
}

// ---------------------------------------------------------------------------
// Small formatting helpers used by the mappers
// ---------------------------------------------------------------------------

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
  const time = start.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAway = Math.floor((start.getTime() - startOfToday.getTime()) / 86_400_000);

  if (daysAway <= 0) {
    return `Today ${time}`;
  }
  if (daysAway === 1) {
    return `Tomorrow ${time}`;
  }

  return `${start.toLocaleDateString([], {weekday: 'short', day: 'numeric', month: 'short'})} ${time}`;
}
