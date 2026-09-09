create type public.category_kind as enum (
  'live_tv',
  'movie',
  'sports',
  'cartoon',
  'other'
);

create type public.stream_protocol as enum (
  'hls',   -- .m3u8 -- what most live providers serve; Media3 handles natively
  'dash',  -- .mpd
  'mp4',   -- progressive download, typical for small VOD files
  'other'
);

create type public.event_status as enum (
  'scheduled',
  'live',
  'finished',
  'cancelled',
  'postponed'
);


-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Keeps `updated_at` honest. Doing this in a trigger rather than in the client
-- means it is correct no matter who writes the row -- admin UI, SQL editor, or
-- a future import script.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;



create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Slugs are used in URLs and deep links, so constrain them to a safe shape.
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(value) between 2 and 80);

-- A stream URL must at least be an absolute HTTP(S) URL. This catches the
-- overwhelmingly common data-entry mistake (a bare path, or a copied
-- "www.example.com") before it reaches a device and shows up as a player error.
create domain public.http_url as text
  check (value ~* '^https?://[^[:space:]]+$');


-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        public.slug not null unique,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  kind        public.category_kind not null default 'other',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.categories is
  'Groupings shown as rows/shelves in the app. `kind` says which content type a category belongs to.';

-- The app's most common read: "active categories of this kind, in display order".
-- A partial index keeps it small by excluding the inactive rows we never show.
create index categories_kind_sort_idx
  on public.categories (kind, sort_order, name)
  where is_active;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- channels  (Live TV)
-- ---------------------------------------------------------------------------
create table public.channels (
  id               uuid primary key default gen_random_uuid(),
  slug             public.slug not null unique,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  description      text,
  logo_url         public.http_url,
  stream_url       public.http_url not null,
  stream_protocol  public.stream_protocol not null default 'hls',

  -- Reserved, not used yet. Some CDNs only serve a stream when a Referer or
  -- User-Agent header is present. Storing them as data means supporting such a
  -- provider later is a row edit, not an app release.
  stream_headers   jsonb check (stream_headers is null or jsonb_typeof(stream_headers) = 'object'),

  category_id      uuid references public.categories (id) on delete set null,

  -- Optional "channel 305" number, for numeric entry from the remote later.
  channel_number   integer check (channel_number > 0),

  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.channels.stream_url is
  'Played directly by the device. Supabase never proxies or re-streams this.';

create index channels_category_sort_idx
  on public.channels (category_id, sort_order, name)
  where is_active;

-- Channel numbers must be unique when present, but most channels have none,
-- so this is a partial unique index rather than a column constraint.
create unique index channels_channel_number_key
  on public.channels (channel_number)
  where channel_number is not null;

create trigger channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- movies  (also serves cartoons -- they differ only by category)
-- ---------------------------------------------------------------------------
create table public.movies (
  id               uuid primary key default gen_random_uuid(),
  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text,
  poster_url       public.http_url,   -- portrait 2:3, for grids
  backdrop_url     public.http_url,   -- landscape 16:9, for the detail hero
  stream_url       public.http_url not null,
  stream_protocol  public.stream_protocol not null default 'hls',

  -- 1888 is the year of the oldest surviving film. The upper bound is a fixed
  -- constant, not `extract(year from now()) + n`: a CHECK constraint that depends
  -- on the current date is re-evaluated on dump/restore, so a row that was legal
  -- when inserted can refuse to load years later.
  release_year     smallint check (release_year between 1888 and 2100),
  duration_seconds integer check (duration_seconds > 0),
  content_rating   text check (content_rating is null or char_length(content_rating) <= 16),

  category_id      uuid references public.categories (id) on delete set null,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.movies is
  'On-demand titles. Cartoons live here too, distinguished by a category with kind = ''cartoon''.';

create index movies_category_sort_idx
  on public.movies (category_id, sort_order, title)
  where is_active;

create index movies_release_year_idx
  on public.movies (release_year desc nulls last)
  where is_active;

create trigger movies_set_updated_at
  before update on public.movies
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- sports  (lookup table)
-- ---------------------------------------------------------------------------
-- A lookup table rather than an enum: you will keep adding sports, and inserting
-- a row is something an admin UI can do. Adding an enum value needs a migration.
create table public.sports (
  slug        public.slug primary key,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  icon_url    public.http_url,
  sort_order  integer not null default 0
);


-- ---------------------------------------------------------------------------
-- sports_events
-- ---------------------------------------------------------------------------
create table public.sports_events (
  id               uuid primary key default gen_random_uuid(),
  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),

  -- `restrict` on purpose: deleting a sport that still has fixtures is almost
  -- certainly a mistake, and we would rather the delete fail loudly.
  sport_slug       public.slug not null references public.sports (slug) on delete restrict,

  competition      text,   -- 'Premier League', 'ICC Champions Trophy'
  home_team        text,
  away_team        text,
  description      text,
  poster_url       public.http_url,

  -- Nullable: a fixture is usually published days before its stream URL exists.
  stream_url       public.http_url,
  stream_protocol  public.stream_protocol not null default 'hls',

  starts_at        timestamptz not null,
  ends_at          timestamptz,
  status           public.event_status not null default 'scheduled',

  category_id      uuid references public.categories (id) on delete set null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint sports_events_ends_after_starts
    check (ends_at is null or ends_at > starts_at),

  -- An event the app is told is playable must actually have something to play.
  -- This is the constraint that stops "tap match -> black screen".
  constraint sports_events_live_requires_stream
    check (status <> 'live' or stream_url is not null)
);

-- Drives both "on now" and "coming up" queries.
create index sports_events_status_starts_idx
  on public.sports_events (status, starts_at)
  where is_active;

create index sports_events_starts_at_idx
  on public.sports_events (starts_at desc)
  where is_active;

create index sports_events_sport_idx
  on public.sports_events (sport_slug, starts_at desc)
  where is_active;

create trigger sports_events_set_updated_at
  before update on public.sports_events
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- Row Level Security
-- ===========================================================================

-- ===========================================================================

alter table public.categories    enable row level security;
alter table public.channels      enable row level security;
alter table public.movies        enable row level security;
alter table public.sports        enable row level security;
alter table public.sports_events enable row level security;

-- ---- categories ----
create policy "Active categories are readable by anyone"
  on public.categories for select
  to anon, authenticated
  using (is_active);

create policy "Admins manage categories"
  on public.categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- channels ----
create policy "Active channels are readable by anyone"
  on public.channels for select
  to anon, authenticated
  using (is_active);

create policy "Admins manage channels"
  on public.channels for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- movies ----
create policy "Active movies are readable by anyone"
  on public.movies for select
  to anon, authenticated
  using (is_active);

create policy "Admins manage movies"
  on public.movies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- sports ----
create policy "Sports are readable by anyone"
  on public.sports for select
  to anon, authenticated
  using (true);

create policy "Admins manage sports"
  on public.sports for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- sports_events ----
create policy "Active sports events are readable by anyone"
  on public.sports_events for select
  to anon, authenticated
  using (is_active);

create policy "Admins manage sports events"
  on public.sports_events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ===========================================================================
-- Privileges
-- ===========================================================================

-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select on
  public.categories,
  public.channels,
  public.movies,
  public.sports,
  public.sports_events
to anon, authenticated;

grant insert, update, delete on
  public.categories,
  public.channels,
  public.movies,
  public.sports,
  public.sports_events
to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
