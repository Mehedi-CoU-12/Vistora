begin;

select 'movie' as table_name, slug, title, stream_url
  from public.movies
 where stream_protocol = 'youtube'
   and is_active
 order by title;


update public.movies
   set is_active = false
 where stream_protocol = 'youtube'
   and is_active;



do $$
declare
  has_series boolean := to_regclass('public.episodes') is not null;
  n_movies   integer;
  n_episodes integer := 0;
  n_series   integer := 0;
begin
  select count(*) into n_movies
    from public.movies
   where stream_protocol = 'youtube' and not is_active;

  if has_series then
    execute $q$
      update public.episodes
         set is_active = false
       where stream_protocol = 'youtube'
         and is_active
    $q$;
    get diagnostics n_episodes = row_count;

    execute $q$
      update public.series s
         set is_active = false
       where s.is_active
         and exists (select 1 from public.episodes e where e.series_id = s.id)
         and not exists (
           select 1 from public.episodes e
            where e.series_id = s.id and e.stream_protocol <> 'youtube'
         )
    $q$;
    get diagnostics n_series = row_count;
  end if;

  raise notice 'hidden: % film(s)%',
    n_movies,
    case
      when not has_series then ' (no episodes table yet -- migration 0005 not applied)'
      else format(', %s episode(s), %s series', n_episodes, n_series)
    end;

  if n_movies = 0 and n_episodes = 0 then
    raise notice 'nothing matched -- no YouTube rows are active. Already run, or you never imported from tmdb/jikan.';
  end if;
end;
$$;

commit;

