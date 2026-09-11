-- ---------------------------------------------------------------------------
-- Remove the sample content that seed.sql inserts
-- ---------------------------------------------------------------------------
--
-- `seed.sql` exists so a fresh clone has something to look at before you have
-- imported anything: nine placeholder channels pointed at Apple's reference HLS
-- streams, six Blender short films, and six invented fixtures. Once you have
-- real content they are just noise, and the channels are the worst of it --
-- they sit at the top of the Live TV grid because they were inserted first.
--
-- This deletes exactly those rows, BY SLUG. It is not a "delete everything that
-- looks fake" heuristic: every slug below is copied from seed.sql, so anything
-- you imported or added yourself is untouched no matter what it is called.
--
-- ---------------------------------------------------------------------------
-- What this deliberately does NOT delete
-- ---------------------------------------------------------------------------
-- CATEGORIES. This is the important one. seed.sql and the importers share
-- category slugs on purpose -- `import-iptv.mjs` writes 'news', 'sports-tv' and
-- 'entertainment', and `import-archive.mjs` writes 'action' and 'animation',
-- all with the same sort values so that re-running an importer does not
-- reshuffle a rail you have already arranged. Deleting those because seed.sql
-- also mentions them would set `category_id` to null on every real channel and
-- film you have (the foreign keys are `on delete set null`), quietly moving
-- your entire library into "uncategorised".
--
-- There is an optional sweep at the bottom for categories that genuinely end up
-- empty. It is commented out; read it before running it.
--
-- SPORTS (`football`, `cricket`, `basketball`, `tennis`). A four-row lookup
-- table with no content in it. Keeping it costs nothing, and `sports_events`
-- references it with `on delete restrict`, so deleting it now is just something
-- to undo the first time you add a real fixture.
--
-- ---------------------------------------------------------------------------
-- Running it
-- ---------------------------------------------------------------------------
--   psql "$DATABASE_URL" -f supabase/cleanup_sample_data.sql
--
-- or paste it into the Supabase dashboard SQL Editor. It is one transaction:
-- either every sample row goes or none does. It is also safe to run twice --
-- the second run deletes nothing and reports zero.
--
-- The SELECT at the top runs before any delete, so the output is a record of
-- exactly what was about to be removed.
--
-- NOTE: this does not stop the sample data coming BACK. Anything that applies
-- seed.sql again will reinsert it -- `supabase db reset`, or the migrate
-- workflow with `sample_seed` ticked. Those are the two places to avoid.

begin;

-- ---------------------------------------------------------------------------
-- What is about to be deleted
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- What is left
-- ---------------------------------------------------------------------------
-- Counted inside the same transaction, so these are the numbers the app will
-- see the moment this commits.
do $$
declare
  -- Whether migration 0005 has been applied yet. Both branches are normal:
  -- this script is just as useful on a database that predates the series
  -- tables, which is exactly the case that has to keep working.
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

  -- EXECUTE, not a plain SELECT, and this is the whole reason the block is
  -- shaped like this. PostgreSQL resolves every table named in a statement
  -- when it PLANS the statement, before a single value is evaluated -- so a
  -- runtime guard like `to_regclass('public.series') is null or not exists
  -- (select 1 from public.series ...)` does not help at all. The planner
  -- resolves `public.series`, does not find it, and raises 42P01 on a database
  -- where the guard was supposed to mean "skip this". Deferring the text to
  -- EXECUTE is what actually keeps the reference out of the plan.
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

  -- The series count is appended rather than slotted into a fixed '% series'
  -- placeholder, so that a database without the table reads as a sentence
  -- instead of "no series table yet series".
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


-- ---------------------------------------------------------------------------
-- OPTIONAL: remove categories that are now empty
-- ---------------------------------------------------------------------------
-- An empty category is a visible wart: `CategoryPicker` renders it as a filter
-- you can select, and selecting it shows "Nothing in this category". After the
-- deletes above, the sports ones ('football', 'cricket') are certainly empty,
-- because every fixture in the database was sample data.
--
-- It is commented out because "empty" and "unused" are not the same thing. If
-- you are about to run an importer that writes into one of these -- say
-- 'kids-cartoons' before `npm run import:cartoons` -- deleting it now just
-- means it gets recreated with default ordering, losing any sort_order you set
-- by hand.
--
-- Read the SELECT, and if you agree with the list, run the DELETE.
--
-- If you have NOT applied migration 0005 yet, delete the `public.series` line
-- from both statements first -- PostgreSQL resolves every table named in a
-- statement when it plans it, so naming one that does not exist fails the
-- query outright rather than skipping that clause.
--
-- select slug, name, kind from public.categories c
--  where not exists (select 1 from public.channels      x where x.category_id = c.id)
--    and not exists (select 1 from public.movies        x where x.category_id = c.id)
--    and not exists (select 1 from public.series        x where x.category_id = c.id)
--    and not exists (select 1 from public.sports_events x where x.category_id = c.id)
--  order by kind, sort_order;
--
-- delete from public.categories c
--  where not exists (select 1 from public.channels      x where x.category_id = c.id)
--    and not exists (select 1 from public.movies        x where x.category_id = c.id)
--    and not exists (select 1 from public.series        x where x.category_id = c.id)
--    and not exists (select 1 from public.sports_events x where x.category_id = c.id);
