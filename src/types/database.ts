export type CategoryKind =
  | 'live_tv'
  | 'movie'
  | 'sports'
  | 'cartoon'
  | 'anime'
  | 'series'
  | 'other';

export type StreamProtocol = 'hls' | 'dash' | 'mp4' | 'youtube' | 'other';

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

export interface Database {
  public: {
    Tables: {
      categories: { Row: CategoryRow; Insert: never; Update: never };
      channels: { Row: ChannelRow; Insert: never; Update: never };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      category_kind: CategoryKind;
      stream_protocol: StreamProtocol;
    };
    CompositeTypes: Record<string, never>;
  };
}
