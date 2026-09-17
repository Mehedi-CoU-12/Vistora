begin;


select 'channel' as table_name, slug, name as title from public.channels
 where slug in (
   'vistora-one', 'vistora-news', 'vistora-cinema', 'vistora-sport',
   'vistora-classics', 'vistora-discovery', 'vistora-4k', 'vistora-extra',
   'vistora-draft'
 )
union all
select 'movie', slug, title from public.movies
 where slug in (
   'big-buck-bunny', 'tears-of-steel', 'sintel', 'skate-phantom-4k',
   'bunny-shorts', 'bipbop-adventures'
 )
union all
select 'sports_event', slug, title from public.sports_events
 where slug in (
   'epl-live-now', 't20-live-now', 'epl-upcoming', 'odi-upcoming',
   'nba-upcoming', 'epl-finished'
 )
order by table_name, slug;


-- ---------------------------------------------------------------------------
-- The deletes
-- ---------------------------------------------------------------------------
delete from public.channels
 where slug in (
   'vistora-one', 'vistora-news', 'vistora-cinema', 'vistora-sport',
   'vistora-classics', 'vistora-discovery', 'vistora-4k', 'vistora-extra',
   'vistora-draft'
 );

delete from public.movies
 where slug in (
   'big-buck-bunny', 'tears-of-steel', 'sintel', 'skate-phantom-4k',
   'bunny-shorts', 'bipbop-adventures'
 );

delete from public.sports_events
 where slug in (
   'epl-live-now', 't20-live-now', 'epl-upcoming', 'odi-upcoming',
   'nba-upcoming', 'epl-finished'
 );


do $$
declare
  has_series boolean := to_regclass('public.series') is not null;
  empty_sql  text;
  n_channels integer;
  n_movies   integer;
  n_series   integer;
  n_events   integer;
  n_empty    integer;
begin
  select count(*) into n_channels from public.channels;
  select count(*) into n_movies   from public.movies;
  select count(*) into n_events   from public.sports_events;

  if has_series then
    execute 'select count(*) from public.series' into n_series;
  else
    n_series := -1;
  end if;

  empty_sql :=
    'select count(*) from public.categories c
      where not exists (select 1 from public.channels      x where x.category_id = c.id)
        and not exists (select 1 from public.movies        x where x.category_id = c.id)
        and not exists (select 1 from public.sports_events x where x.category_id = c.id)';

  if has_series then
    empty_sql := empty_sql ||
      ' and not exists (select 1 from public.series x where x.category_id = c.id)';
  end if;

  execute empty_sql into n_empty;

  raise notice 'remaining: % channels, % films, % fixtures%',
    n_channels, n_movies, n_events,
    case
      when n_series < 0 then ' (no series table yet -- migration 0005 not applied)'
      else format(', %s series', n_series)
    end;

  if n_empty > 0 then
    raise notice '% categor% now hold nothing. See the optional sweep at the bottom of this file.',
      n_empty, case when n_empty = 1 then 'y' else 'ies' end;
  end if;
end;
$$;

commit;
