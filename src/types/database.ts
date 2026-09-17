export type CategoryKind =
  | 'live_tv'
  | 'movie'
  | 'sports'
  | 'cartoon'
  | 'anime'
  | 'other';

export type MovieCategoryKind = Extract<
  CategoryKind,
  'movie' | 'cartoon' | 'anime'
>;

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

export interface SeriesRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  release_year: number | null;
  content_rating: string | null;

  source: string | null;
  source_id: string | null;

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
