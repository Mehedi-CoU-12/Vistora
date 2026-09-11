-- ---------------------------------------------------------------------------
-- 0005 -- series and episodes
-- ---------------------------------------------------------------------------
--
-- Until now every playable thing was one row with one stream_url: a channel, a
-- film, a fixture. That shape is the reason the Anime tab could never be more
-- than a shelf of one-offs, because the unit of anime is not a title, it is a
-- title with twenty-six of them inside it.
--
-- ---------------------------------------------------------------------------
-- Why a new table rather than a self-reference on `movies`
-- ---------------------------------------------------------------------------
-- The cheap version of this is `movies.parent_id` plus an episode number, and
-- it is wrong for a reason visible in the very first constraint: `movies`
-- declares `stream_url ... not null`, because a film that cannot be played is
-- not a film. A series has no stream of its own -- there is nothing to play
-- when you select "Attack on Titan", only a list to choose from -- so the
-- self-referencing version has to make `stream_url` nullable for every row in
-- the table to accommodate the handful that are containers. That trades a real
-- guarantee about 100% of films for convenience about the parents.
--
-- Split in two, each table keeps the constraint that is true of it: a series
-- has no stream_url column at all, and an episode's is `not null` exactly like
-- a film's. "Tapping this opens a player" stops being something the app has to
-- check at runtime and becomes something the schema states.
--
-- It also keeps `movies` meaning one thing. Cartoons and anime films already
-- live there, told apart only by their category's kind, and that works because
-- they genuinely are films. Episodes are not, and a table you have to filter
-- before any query is correct is two tables wearing one name.
--
-- ---------------------------------------------------------------------------
-- Not anime-specific
-- ---------------------------------------------------------------------------
-- Nothing below mentions anime. A series carries a `category_id` like every
-- other content row, so the same tables hold a cartoon series or a documentary
-- strand the day someone imports one -- which is the same trick that let anime
-- reuse `movies` in 0002, applied one level up.

-- ---------------------------------------------------------------------------
-- series
-- ---------------------------------------------------------------------------
create table public.series (
  id               uuid primary key default gen_random_uuid(),
  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text,
  poster_url       public.http_url,   -- portrait 2:3, for grids
  backdrop_url     public.http_url,   -- landscape 16:9, for the detail hero

  -- The year the series STARTED. A long-running show spans many, and the app
  -- shows this next to the episode count where "2013" is useful and "2013-2023"
  -- is a second column nobody asked for.
  release_year     smallint check (release_year between 1888 and 2100),
  content_rating   text check (content_rating is null or char_length(content_rating) <= 16),

  -- Where the rows came from, e.g. ('youtube', a channel's playlist id). Not a
  -- foreign key to anything and not read by the app: it exists so a re-import
  -- can recognise what it already wrote, and so that a title whose upstream
  -- playlist is deleted can be found and retired rather than lingering as a
  -- series whose episodes all 404. `unique` on the pair, not on source_id
  -- alone, because two providers may well hand out the same opaque id.
  source           text check (source is null or char_length(source) <= 40),
  source_id        text check (source_id is null or char_length(source_id) <= 200),

  -- Denormalised count of the rows in `episodes`, maintained by the trigger
  -- below. It is here because the Anime grid shows "24 episodes" under every
  -- card, and the alternative is a correlated subquery per card on the app's
  -- most-rendered screen -- or an embedded PostgREST aggregate, which ties the
  -- grid to a feature not every PostgREST deployment exposes and fails the
  -- whole tab with a 400 when it does not.
  episode_count    integer not null default 0 check (episode_count >= 0),

  category_id      uuid references public.categories (id) on delete set null,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint series_source_key unique (source, source_id)
);

comment on table public.series is
  'A title made of episodes. Has no stream of its own -- selecting one opens its episode list, never a player.';

comment on column public.series.episode_count is
  'Denormalised count of public.episodes rows. Maintained by series_refresh_episode_count; never write it by hand.';

-- Mirrors movies_category_sort_idx: "active series of this category, in
-- display order" is the Anime tab's query.
create index series_category_sort_idx
  on public.series (category_id, sort_order, title)
  where is_active;

create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- episodes
-- ---------------------------------------------------------------------------
create table public.episodes (
  id               uuid primary key default gen_random_uuid(),

  -- `cascade`, unlike the `set null` used for category_id everywhere else. An
  -- episode without its series is not an orphan that can be re-filed later, it
  -- is unreachable: nothing in the app lists episodes except through the series
  -- screen, so leaving them behind would be leaking rows no query will ever
  -- return again.
  series_id        uuid not null references public.series (id) on delete cascade,

  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text,

  -- 16:9 still. Named `thumbnail_url` rather than `poster_url` because that is
  -- what it is: episode artwork is a frame from the episode, never a portrait
  -- poster, and the list renders it landscape.
  thumbnail_url    public.http_url,

  stream_url       public.http_url not null,
  stream_protocol  public.stream_protocol not null default 'hls',
  stream_headers   jsonb check (stream_headers is null or jsonb_typeof(stream_headers) = 'object'),

  -- Season 1 by default, because the overwhelming majority of what gets
  -- imported is a single run and making every importer say "1" is a way to
  -- eventually not say it.
  season           smallint not null default 1 check (season > 0),
  episode_number   smallint not null check (episode_number > 0),

  duration_seconds integer check (duration_seconds > 0),
  air_date         date,

  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- The constraint that makes the episode list trustworthy. Without it an
  -- importer that fails to parse a number and falls back to a position can
  -- write two "episode 7"s, and the list renders both with no hint which is
  -- which. Colliding on import is loud and fixable; colliding in the UI is not.
  constraint episodes_slot_key unique (series_id, season, episode_number)
);

comment on column public.episodes.stream_url is
  'Played directly by the device, or handed to an external app when stream_protocol = ''youtube''. Supabase never proxies it.';

-- The series screen's only query: this series, in running order. Covers the
-- ordering as well as the filter, so the read needs no sort.
create index episodes_series_order_idx
  on public.episodes (series_id, season, episode_number)
  where is_active;

create trigger episodes_set_updated_at
  before update on public.episodes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Keeping series.episode_count honest
-- ---------------------------------------------------------------------------
-- Recomputed with a COUNT rather than incremented with +1/-1. An increment is
-- faster and is the version that drifts: it has to get insert, delete, an
-- update that moves an episode between series, and every rolled-back
-- transaction individually right, and when it is wrong there is no symptom
-- except a number on a card that is quietly off by one forever. A recount is
-- one indexed aggregate over the rows of a single series -- tens, not millions.
--
-- `is_active` is deliberately NOT in the count's filter even though the reading
-- queries have it. The count is shown as "how long is this show", which does
-- not change because one episode is temporarily withdrawn, and a count that
-- disagreed with the series' own advertised length would read as a bug.
create or replace function public.refresh_series_episode_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched uuid[];
  affected uuid;
begin
  -- Spelled out branch by branch rather than folded into one expression over
  -- `old` and `new`. PL/pgSQL evaluates every parameter of a statement before
  -- running it, so a single expression mentioning both records raises "record
  -- new is not assigned yet" on DELETE (and the mirror of that on INSERT) even
  -- when the branch that reads it could never be taken.
  if tg_op = 'INSERT' then
    touched := array[new.series_id];
  elsif tg_op = 'DELETE' then
    touched := array[old.series_id];
  elsif new.series_id = old.series_id then
    -- The ordinary update: retitling an episode, fixing its URL. One series,
    -- and listing it twice would mean running the same recount twice.
    touched := array[new.series_id];
  else
    -- An episode moved between series. Both counts are now wrong.
    touched := array[old.series_id, new.series_id];
  end if;

  foreach affected in array touched
  loop
    update public.series s
       set episode_count = (
             select count(*) from public.episodes e where e.series_id = affected
           )
     where s.id = affected;
  end loop;

  return null;  -- AFTER trigger; the return value is ignored.
end;
$$;

comment on function public.refresh_series_episode_count() is
  'Recomputes series.episode_count for every series an episode write touched.';

create trigger episodes_refresh_series_count
  after insert or update or delete on public.episodes
  for each row execute function public.refresh_series_episode_count();


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Identical in shape to every other content table in 0001: the world reads
-- active rows, admins write.
alter table public.series   enable row level security;
alter table public.episodes enable row level security;

create policy "Active series are readable by anyone"
  on public.series for select
  to anon, authenticated
  using (is_active);

create policy "Admins manage series"
  on public.series for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- An episode is readable when it is active AND its series is. Without the
-- second half, deactivating a series would hide it from the grid while leaving
-- its episodes fetchable -- and since the app reads episodes by series_id, a
-- stale deep link would still play a withdrawn show.
create policy "Active episodes of active series are readable by anyone"
  on public.episodes for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.series s
      where s.id = episodes.series_id and s.is_active
    )
  );

create policy "Admins manage episodes"
  on public.episodes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The RLS policy above runs `exists (select 1 from public.series ...)` for
-- every candidate episode row, and the primary key already serves it. Stated
-- here only so the next person reading the policy knows it is not a seq scan.


-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant select on public.series, public.episodes to anon, authenticated;
grant insert, update, delete on public.series, public.episodes to authenticated;

-- The trigger function is `security definer` so that it can keep the count
-- correct when an admin writes episodes, without granting UPDATE on every
-- column of `series` to a role that should only be touching `episodes`.
grant execute on function public.refresh_series_episode_count() to authenticated;


-- ---------------------------------------------------------------------------
-- Search indexes
-- ---------------------------------------------------------------------------
-- The same trigram treatment 0003 gave the other tables, for the same reason
-- and with the same caveat: below roughly a hundred thousand rows the planner
-- correctly ignores these and scans instead. Read the header of
-- 0003_search_indexes.sql before measuring.
--
-- Both searched columns are indexed, not just the title, because the queries
-- are disjunctions and PostgreSQL can only combine indexes across an OR when
-- EVERY branch has one.
--
-- Episodes are not indexed and not searched. A search for "attack" should
-- return the series once, not the series and each of its seventy-five
-- episodes, which is a judgement about what search means here rather than a
-- performance decision -- see SERIES_SEARCH_COLUMNS in
-- src/services/contentService.ts.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

create index if not exists series_title_trgm_idx
  on public.series using gin (title gin_trgm_ops)
  where is_active;

create index if not exists series_description_trgm_idx
  on public.series using gin (description gin_trgm_ops)
  where is_active;
