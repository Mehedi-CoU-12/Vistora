/**
 * Shape of the PostgreSQL schema, as seen by the client.
 *
 * These types mirror supabase/migrations/0001_initial_schema.sql by hand. Once
 * your project is up you can generate them instead and delete the hand-written
 * versions:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 *
 * Keeping them here for now means the app typechecks before you have a project,
 * and it keeps the whole schema readable in one screen.
 */

export type CategoryKind =
  | 'live_tv'
  | 'movie'
  | 'sports'
  | 'cartoon'
  | 'anime'
  | 'other';

/**
 * The kinds whose titles live in the `movies` table.
 *
 * Cartoons and anime are not separate tables -- they are rows in `movies` whose
 * category carries the matching kind. Naming the subset keeps
 * `fetchMovies({categoryKind})` from accepting 'live_tv', which would silently
 * return nothing.
 */
export type MovieCategoryKind = Extract<
  CategoryKind,
  'movie' | 'cartoon' | 'anime'
>;

/**
 * How the player should interpret `stream_url`.
 *
 * Three of these name a container the device decodes itself. `youtube` is the
 * odd one and the difference is load-bearing: it means the URL is a PAGE, not
 * media, and the app hands it to the YouTube app rather than to Media3. See
 * supabase/migrations/0004_add_youtube_protocol.sql for why that is the only
 * honest way to carry one, and services/externalPlayback.ts for what the app
 * does with it.
 */
export type StreamProtocol = 'hls' | 'dash' | 'mp4' | 'youtube' | 'other';

export type EventStatus =
  | 'scheduled'
  | 'live'
  | 'finished'
  | 'cancelled'
  | 'postponed';

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  kind: CategoryKind;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  stream_url: string;
  stream_protocol: StreamProtocol;
  /** Extra HTTP headers some CDNs require (Referer, User-Agent). Reserved. */
  stream_headers: Record<string, string> | null;
  category_id: string | null;
  channel_number: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MovieRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  stream_url: string;
  stream_protocol: StreamProtocol;
  release_year: number | null;
  duration_seconds: number | null;
  content_rating: string | null;
  category_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A title made of episodes. Note what is NOT here: `stream_url`. A series has
 * nothing to play -- selecting one opens its episode list -- and the schema
 * says so by omitting the column rather than by making it nullable. See the
 * header of supabase/migrations/0005_series_and_episodes.sql.
 */
export interface SeriesRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  release_year: number | null;
  content_rating: string | null;
  /** Provenance, e.g. 'youtube'. Written by importers; never read by the app. */
  source: string | null;
  source_id: string | null;
  /** Denormalised, maintained by a trigger. Counts every episode, active or not. */
  episode_count: number;
  category_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EpisodeRow {
  id: string;
  series_id: string;
  slug: string;
  title: string;
  description: string | null;
  /** 16:9 still, not a portrait poster -- which is why it is not `poster_url`. */
  thumbnail_url: string | null;
  stream_url: string;
  stream_protocol: StreamProtocol;
  stream_headers: Record<string, string> | null;
  season: number;
  episode_number: number;
  duration_seconds: number | null;
  air_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SportRow {
  slug: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
}

export interface SportsEventRow {
  id: string;
  slug: string;
  title: string;
  sport_slug: string;
  competition: string | null;
  home_team: string | null;
  away_team: string | null;
  description: string | null;
  poster_url: string | null;
  /** Null until the provider publishes a URL, which is why it is nullable here. */
  stream_url: string | null;
  stream_protocol: StreamProtocol;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * The generic parameter `@supabase/supabase-js` expects. Only the pieces the app
 * actually uses are filled in; Insert/Update are typed loosely because the client
 * never writes (RLS forbids it -- writes happen from the future admin tool).
 */
export interface Database {
  public: {
    Tables: {
      categories: { Row: CategoryRow; Insert: never; Update: never };
      channels: { Row: ChannelRow; Insert: never; Update: never };
      movies: { Row: MovieRow; Insert: never; Update: never };
      series: { Row: SeriesRow; Insert: never; Update: never };
      episodes: { Row: EpisodeRow; Insert: never; Update: never };
      sports: { Row: SportRow; Insert: never; Update: never };
      sports_events: { Row: SportsEventRow; Insert: never; Update: never };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      category_kind: CategoryKind;
      stream_protocol: StreamProtocol;
      event_status: EventStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
