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
 * The protocols the app can actually decode.
 *
 * Narrower than `StreamProtocol` by exactly one value, and that gap is the whole
 * point. `youtube` says the stored URL is an HTML PAGE rather than media, so it
 * can never describe something the player is handed -- see `toStream` below for
 * what happens to such a row instead. Saying so in the type means the player
 * cannot be given one even by accident, rather than relying on every call site
 * to remember to check.
 */
export type PlayableProtocol = Exclude<StreamProtocol, 'youtube'>;

/**
 * Everything the video player needs, and nothing more.
 *
 * This is the whole contract between the data layer and playback. Note what is
 * absent: no row id, no category, no Supabase anything. See
 * src/player/VideoPlayer.tsx.
 */
export interface Stream {
  url: string;
  protocol: PlayableProtocol;
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
  /**
   * 16:9 artwork, for a hero banner or a details header.
   *
   * Separate from `imageUrl` rather than replacing it, because the two are
   * different pictures and neither substitutes for the other: `imageUrl` is a
   * 2:3 poster built to be recognised at 124dp in a row of twelve, and this is a
   * wide still built to be filled across a whole screen. Cropping a poster to
   * 16:9 removes the title treatment that makes it recognisable; letterboxing a
   * backdrop into a poster slot wastes half the card.
   *
   * Null far more often than not -- in the current library only the TMDB-sourced
   * titles carry one -- which is why every consumer has to have an answer for
   * its absence rather than assuming a hero always has artwork. See
   * `heroArtwork` in components/HeroBanner.tsx for what that answer is.
   */
  backdropUrl: string | null;
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
  /**
   * The metadata a hero or a details screen shows as a row of separated facts --
   * "2026 · Action · 2h 10m".
   *
   * Structured rather than pre-joined into `subtitle`, and the two coexist on
   * purpose. `subtitle` is ONE line sized for a 124dp card, so it is already a
   * lossy summary; a details screen that reused it would be stuck with the
   * card's editing decisions, and a hero that re-derived its own would be a
   * second copy of the formatting rules. The mapper fills both from the row, and
   * each surface takes the shape it needs.
   *
   * Every field is optional because the library is genuinely patchy: 114 of 119
   * films have a year, 80 have a duration, and none have a content rating.
   * `metaParts` below is what turns whatever is present into a clean line.
   */
  meta?: ContentMeta;
}

/** The facts a hero or details screen lists under a title. */
export interface ContentMeta {
  year?: number;
  /** Pre-formatted, e.g. "2h 10m" -- see `formatDuration`. */
  duration?: string;
  /** The category this item is filed under, e.g. "Action". Null when uncategorised. */
  genre?: string;
  /** e.g. "PG". Present in the schema, empty in the current library. */
  rating?: string;
  /** "HD", "4K" -- a claim about the stream rather than about the title. */
  quality?: string;
}

/**
 * The present fields of a `ContentMeta`, in reading order, ready to be joined.
 *
 * A function rather than a string on the item because the separator is a
 * rendering decision -- the hero puts a dot between them, the details screen
 * spaces them as pills -- and because the empty case has to disappear rather
 * than render as " ·  · ".
 */
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

// ---------------------------------------------------------------------------
// Mappers: database row -> app model
// ---------------------------------------------------------------------------
// The only place in the codebase that knows what a column is called.

/**
 * The stream columns every playable row shares. A series carries none of them.
 *
 * Structural rather than a union of the four row types, so one helper serves all
 * of them: `MovieRow` and `SportsEventRow` simply have no `stream_headers`.
 */
interface StreamColumns {
  stream_url: string | null;
  stream_protocol: StreamProtocol;
  stream_headers?: Record<string, string> | null;
}

/**
 * The playable stream a row describes, or null when it does not describe one.
 *
 * ---------------------------------------------------------------------------
 * Why a row can carry a URL and still be unplayable
 * ---------------------------------------------------------------------------
 * `stream_protocol = 'youtube'` means the URL is a PAGE, not media: importers
 * whose only free source for a title was its trailer wrote one of those. The app
 * used to hand them to the YouTube app, so pressing Play on a film left Vistora
 * entirely and played two minutes of marketing for a film the library does not
 * actually have.
 *
 * A trailer is not the film, so the honest answer is that it is missing. Such a
 * row now maps to `stream: null` -- exactly the state an unpublished fixture has
 * always been in -- and the surfaces that already know how to say "you cannot
 * watch this" say it, instead of a different app opening.
 *
 * The enum value stays in the database, because Postgres cannot drop one, and
 * stays in `StreamProtocol`, because rows carrying it are real and still arrive.
 * It just stops here and never becomes a `Stream`.
 */
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

/**
 * How a null stream is explained on a card, when it is worth explaining.
 *
 * The two reasons read differently to a viewer and so get different words: a
 * fixture with no URL yet has not happened, while a row we refuse to decode is
 * simply not in the library. Both are undefined when the row plays, and neither
 * is ever reached for a series -- see the note in `seriesToContentItem`.
 */
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
    // A channel has no backdrop in the schema and would not benefit from one:
    // its artwork is a logo, which is a mark rather than a photograph and looks
    // wrong stretched across a hero. `HeroBanner` handles a null by treating the
    // logo as a mark on a brand field instead.
    backdropUrl: null,
    badge: 'LIVE',
    categoryId: row.category_id,
    description: row.description ?? undefined,
    // No `meta` of its own. A channel row carries no year, no duration and no
    // resolution, and the hero's metadata line is filled in for it later from
    // its category name -- see `withGenre`. Stamping a quality here would be
    // inventing one: nothing in the schema says whether a given stream is HD.
    // A TV channel is by definition a continuous live broadcast.
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
    // A fixture's poster is the only artwork the schema carries for it, so it
    // doubles as the hero backdrop. Unlike a channel logo it IS a photograph,
    // which is what makes the reuse honest here and wrong there.
    backdropUrl: row.poster_url,
    badge: isLive ? 'LIVE' : undefined,
    categoryId: row.category_id,
    description: row.description ?? undefined,
    meta: { genre: row.competition ?? undefined },
    // A scheduled fixture usually has no stream URL yet. Returning null (rather
    // than an empty string) makes "not playable" a state the UI must handle
    // explicitly instead of a crash inside the player.
    stream: toStream(row, isLive),
    // Says out loud what a null stream means for a FIXTURE specifically. A
    // series also has no stream and must stay unlabelled.
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
    // The still IS 16:9 already, so it needs no separate backdrop -- and an
    // episode never heroes anyway; the series it belongs to does.
    backdropUrl: row.thumbnail_url,
    // Short enough to sit in the corner of a 16:9 still, and the one piece of
    // information that tells you where you are in a run of seventy-five.
    badge: `E${row.episode_number}`,
    // An episode belongs to a series, not to a category -- the series carries
    // that. Null here keeps the category filter on the Anime grid from ever
    // matching one.
    categoryId: null,
    description: row.description ?? undefined,
    meta: { duration: formatDuration(row.duration_seconds) ?? undefined },
    stream: toStream(row, false),
    unavailableLabel: unavailableLabelFor(row),
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
