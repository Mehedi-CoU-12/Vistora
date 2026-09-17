
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

set search_path = public, extensions;


create index if not exists channels_name_trgm_idx
  on public.channels using gin (name gin_trgm_ops)
  where is_active;

create index if not exists channels_description_trgm_idx
  on public.channels using gin (description gin_trgm_ops)
  where is_active;



create index if not exists movies_title_trgm_idx
  on public.movies using gin (title gin_trgm_ops)
  where is_active;

create index if not exists movies_description_trgm_idx
  on public.movies using gin (description gin_trgm_ops)
  where is_active;


create index if not exists sports_events_title_trgm_idx
  on public.sports_events using gin (title gin_trgm_ops)
  where is_active;

create index if not exists sports_events_competition_trgm_idx
  on public.sports_events using gin (competition gin_trgm_ops)
  where is_active;

create index if not exists sports_events_home_team_trgm_idx
  on public.sports_events using gin (home_team gin_trgm_ops)
  where is_active;

create index if not exists sports_events_away_team_trgm_idx
  on public.sports_events using gin (away_team gin_trgm_ops)
  where is_active;

