begin;

-- ---------------------------------------------------------------------------
-- What is about to be hidden
-- ---------------------------------------------------------------------------
select 'movie' as table_name, slug, title, stream_url
  from public.movies
 where stream_protocol = 'youtube'
   and is_active
 order by title;


-- ---------------------------------------------------------------------------
-- Movies
-- ---------------------------------------------------------------------------
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

    -- A series with nothing left to play is an empty shell on the rail, so it
    -- goes too -- but only when EVERY episode it has is a trailer. A series
    -- that mixes real files with a trailer keeps both itself and the files.
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


-- ---------------------------------------------------------------------------
-- OPTIONAL: delete them instead of hiding them
-- ---------------------------------------------------------------------------
-- Hiding is reversible and costs a few rows. Deleting is not, and the one
-- thing it buys you is that re-running `scrape:tmdb` writes them back as NEW
-- rows rather than reactivating the hidden ones -- because the seed file
-- upserts on slug and sets `is_active = true` on conflict. That upsert is
-- worth knowing about either way: hide these today, re-run the TMDB scraper
-- tomorrow, and they come straight back. The real fix is to stop importing
-- from a metadata-only source, not to keep sweeping up after it.
--
-- Episodes cascade from series; deleting a series deletes its episodes.
--
-- delete from public.movies   where stream_protocol = 'youtube';
-- delete from public.episodes where stream_protocol = 'youtube';
