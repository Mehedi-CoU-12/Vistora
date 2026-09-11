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

/**
 * The app's own vocabulary, deliberately separate from the database row types.
 *
 * Why bother, when the rows are nearly the same shape? Because the boundary is
 * what keeps the player and the UI independent of PostgreSQL. A card renders a
 * `ContentItem`; the player accepts a `Stream`. Neither has any idea a database
 * exists, so renaming a column touches only the mapper functions below, and the
 * player could be handed a stream from a completely different source tomorrow.
 */

export type ContentKind =
  | 'channel'
  | 'movie'
  | 'sports_event'
  /**
   * A container, not a stream. Selecting one opens its episode list, which is
   * why `stream` is always null on a series and why that null must NOT be read
   * as "broken" -- see `unavailableLabel` below.
   */
  | 'series'
  | 'episode';

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
   * Null when selecting this item does not start a video.
   *
   * That covers two unrelated situations, and the difference is what
   * `unavailableLabel` exists to carry: a fixture whose stream URL has not been
   * published yet is BROKEN-ish and says so on the card, whereas a series has
   * no stream by definition and must not. Before series existed the card could
   * infer one from the other; now it cannot, so the distinction is data.
   */
  stream: Stream | null;
  /**
   * Set only when a null `stream` is worth explaining to the viewer -- "Not
   * started" on an unpublished fixture. Left undefined for a series, whose
   * missing stream is not a defect but the point.
   */
  unavailableLabel?: string;
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
    subtitle:
      row.channel_number !== null ? `Channel ${row.channel_number}` : undefined,
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
    subtitle:
      [row.release_year, formatDuration(row.duration_seconds)]
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
        : { url: row.stream_url, protocol: row.stream_protocol, isLive },
    // Says out loud what a null stream means for a FIXTURE specifically. A
    // series also has no stream and must stay unlabelled.
    unavailableLabel: row.stream_url === null ? 'Not started' : undefined,
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
    categoryId: row.category_id,
    description: row.description ?? undefined,
    // Deliberately null, and deliberately without an `unavailableLabel`. There
    // is no such thing as playing a series; the app opens its episode list.
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
    // Short enough to sit in the corner of a 16:9 still, and the one piece of
    // information that tells you where you are in a run of seventy-five.
    badge: `E${row.episode_number}`,
    // An episode belongs to a series, not to a category -- the series carries
    // that. Null here keeps the category filter on the Anime grid from ever
    // matching one.
    categoryId: null,
    description: row.description ?? undefined,
    stream: {
      url: row.stream_url,
      protocol: row.stream_protocol,
      headers: row.stream_headers ?? undefined,
      isLive: false,
    },
  };
}

/**
 * One season's worth of episodes, in running order.
 *
 * The app groups rather than rendering a flat list because an unlabelled jump
 * from episode 12 back to episode 1 is indistinguishable from a sorting bug.
 * Where there is only one season -- most of what gets imported -- `SeriesScreen`
 * renders the group without its header, so the common case pays nothing for it.
 */
export interface Season {
  season: number;
  episodes: ContentItem[];
}

/**
 * Groups episode rows into seasons, both levels in ascending order.
 *
 * Sorting here rather than relying on the query's ORDER BY is not redundant:
 * this is also the function a test can hand a deliberately shuffled list, and
 * the grouping is only correct if the rows within a season are ordered, which
 * a `Map` preserves from insertion but does not impose.
 */
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

// ---------------------------------------------------------------------------
// Small formatting helpers used by the mappers
// ---------------------------------------------------------------------------

/** "1 episode" / "24 episodes". */
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
