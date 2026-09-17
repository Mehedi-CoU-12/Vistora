
create table public.series (
  id               uuid primary key default gen_random_uuid(),
  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text,
  poster_url       public.http_url,  
  backdrop_url     public.http_url,   


  release_year     smallint check (release_year between 1888 and 2100),
  content_rating   text check (content_rating is null or char_length(content_rating) <= 16),


  source           text check (source is null or char_length(source) <= 40),
  source_id        text check (source_id is null or char_length(source_id) <= 200),


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
  series_id        uuid not null references public.series (id) on delete cascade,
  slug             public.slug not null unique,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text,
  thumbnail_url    public.http_url,

  stream_url       public.http_url not null,
  stream_protocol  public.stream_protocol not null default 'hls',
  stream_headers   jsonb check (stream_headers is null or jsonb_typeof(stream_headers) = 'object'),
  season           smallint not null default 1 check (season > 0),
  episode_number   smallint not null check (episode_number > 0),

  duration_seconds integer check (duration_seconds > 0),
  air_date         date,

  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint episodes_slot_key unique (series_id, season, episode_number)
);

comment on column public.episodes.stream_url is
  'Played directly by the device, or handed to an external app when stream_protocol = ''youtube''. Supabase never proxies it.';

create index episodes_series_order_idx
  on public.episodes (series_id, season, episode_number)
  where is_active;

create trigger episodes_set_updated_at
  before update on public.episodes
  for each row execute function public.set_updated_at();


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
  if tg_op = 'INSERT' then
    touched := array[new.series_id];
  elsif tg_op = 'DELETE' then
    touched := array[old.series_id];
  elsif new.series_id = old.series_id then
    touched := array[new.series_id];
  else
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

  return null; 
end;
$$;

comment on function public.refresh_series_episode_count() is
  'Recomputes series.episode_count for every series an episode write touched.';

create trigger episodes_refresh_series_count
  after insert or update or delete on public.episodes
  for each row execute function public.refresh_series_episode_count();


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

grant select on public.series, public.episodes to anon, authenticated;
grant insert, update, delete on public.series, public.episodes to authenticated;


grant execute on function public.refresh_series_episode_count() to authenticated;


create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

create index if not exists series_title_trgm_idx
  on public.series using gin (title gin_trgm_ops)
  where is_active;

create index if not exists series_description_trgm_idx
  on public.series using gin (description gin_trgm_ops)
  where is_active;
