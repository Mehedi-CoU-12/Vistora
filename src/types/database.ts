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

export type CategoryKind = 'live_tv' | 'movie' | 'sports' | 'cartoon' | 'other';

/** How the player should interpret `stream_url`. */
export type StreamProtocol = 'hls' | 'dash' | 'mp4' | 'other';

export type EventStatus = 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';

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
      categories: {Row: CategoryRow; Insert: never; Update: never};
      channels: {Row: ChannelRow; Insert: never; Update: never};
      movies: {Row: MovieRow; Insert: never; Update: never};
      sports: {Row: SportRow; Insert: never; Update: never};
      sports_events: {Row: SportsEventRow; Insert: never; Update: never};
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
