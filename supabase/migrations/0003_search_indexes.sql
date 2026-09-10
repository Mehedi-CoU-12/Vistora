-- ---------------------------------------------------------------------------
-- 0003 -- trigram indexes for the search feature
-- ---------------------------------------------------------------------------
--
-- Search asks each content table for a case-insensitive substring match across
-- its text columns:
--
--   name ilike '%term%' or description ilike '%term%'
--
-- A btree index cannot answer that. Btree orders whole values, so it can serve
-- `like 'term%'` (a prefix is a range) and nothing else -- a leading wildcard
-- means the match can start anywhere in the string, so every row has to be
-- looked at. `pg_trgm` fixes it by indexing the three-character sequences a
-- value contains, which a substring pattern can also be broken into.
--
-- ---------------------------------------------------------------------------
-- This migration is optional, and measurably so
-- ---------------------------------------------------------------------------
-- The app is identical with and without it: same queries, same results. What
-- changes is only which plan the database picks, and below a certain size it
-- picks the sequential scan whether these indexes exist or not -- correctly,
-- because at that size the scan is genuinely the cheaper plan.
--
-- Measured on PostgreSQL 18, `explain (analyze)` of the exact query
-- `fetchMovies`/`fetchChannels` generate:
--
--   10,000 channels    seq scan chosen, ~14ms      (indexes present, unused)
--   20,000 movies      seq scan chosen, ~5ms       (indexes present, unused)
--   200,000 movies     BitmapOr chosen, ~1.6ms     -- versus ~79ms scanning
--
-- So: a personal library, even a full iptv-org channel import, is already fast
-- enough that this migration changes nothing at all, and the 300ms typing
-- debounce hides an order of magnitude more than the difference. It starts to
-- matter somewhere around a hundred thousand rows in one table, where it is
-- worth about 50x. Treat it as insurance against a library that grows, not as a
-- fix for something that is currently slow.
--
-- ---------------------------------------------------------------------------
-- Why every searched column is indexed, not just the important ones
-- ---------------------------------------------------------------------------
-- The queries are disjunctions, and PostgreSQL can only combine indexes across
-- an OR (a BitmapOr) when EVERY branch has a usable index. Index `movies.title`
-- but not `movies.description` and the planner has to seq-scan anyway to
-- evaluate the second branch -- so a partial job here buys exactly nothing,
-- which is why the descriptions are in the list despite being the columns least
-- likely to be what someone was searching for.
--
-- The column lists below mirror `*_SEARCH_COLUMNS` in
-- src/services/contentService.ts. If you add a column to one, add it here too;
-- if you forget, search still returns the right rows, just slowly.
--
-- ---------------------------------------------------------------------------
-- Three notes on running it
-- ---------------------------------------------------------------------------
--   * Everything is `if not exists`, so this is safe to apply twice -- which
--     matters because `supabase db push`, .github/workflows/migrate.yml and a
--     manual `psql -f` can all have been run against the same project.
--
--   * There is no `begin;` / `commit;` here, deliberately: migrate.yml wraps
--     each file in one transaction of its own. Everything below is transactional
--     (which is why these are plain `create index` and not `create index
--     concurrently` -- that one cannot run inside a transaction at all).
--
--   * The three lines below exist to make `gin_trgm_ops` resolve wherever
--     pg_trgm happens to live, which is not the same answer on every database
--     this schema is expected to run on. Supabase keeps extensions in an
--     `extensions` schema and may have pg_trgm there already; a plain
--     PostgreSQL instance has no such schema and would reject `with schema
--     extensions` outright. Creating the schema first covers the second case,
--     and putting both schemas on the search_path covers an existing install in
--     either of them -- the alternative, a hard-coded `extensions.gin_trgm_ops`,
--     fails with a confusing "operator class does not exist" on any database
--     that put it somewhere else.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Resolved to an OID and stored when each index below is created, so this
-- affects only this script -- nothing downstream depends on the search_path.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Channels (Live TV)
-- ---------------------------------------------------------------------------

-- Partial, matching the browse indexes in 0001: the inactive rows are invisible
-- to the anon role through RLS and are never searched, so keeping them out of
-- the index keeps it small.
create index if not exists channels_name_trgm_idx
  on public.channels using gin (name gin_trgm_ops)
  where is_active;

create index if not exists channels_description_trgm_idx
  on public.channels using gin (description gin_trgm_ops)
  where is_active;

-- ---------------------------------------------------------------------------
-- Movies, cartoons and anime
-- ---------------------------------------------------------------------------
-- One pair of indexes covers all three tabs. Cartoons and anime are rows in
-- this same table, told apart by their category's kind, and that kind filter is
-- a join condition applied alongside the search rather than part of it.

create index if not exists movies_title_trgm_idx
  on public.movies using gin (title gin_trgm_ops)
  where is_active;

create index if not exists movies_description_trgm_idx
  on public.movies using gin (description gin_trgm_ops)
  where is_active;

-- ---------------------------------------------------------------------------
-- Sports events
-- ---------------------------------------------------------------------------
-- Four columns, because a fixture is looked for by any of the names printed on
-- it: the fixture itself, the competition, or either side.

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

-- ---------------------------------------------------------------------------
-- Two caveats worth knowing before you measure
-- ---------------------------------------------------------------------------
-- A seq scan in your EXPLAIN output does not mean these indexes are broken. It
-- is the expected plan at library scale (see the numbers above) and the right
-- one. To confirm the indexes are usable at all, force the planner's hand:
--
--   set enable_seqscan = off;
--   explain (analyze) select id, title from public.movies
--     where is_active = true
--       and (title ilike '%iron%' or description ilike '%iron%');
--
-- That should show a BitmapOr over `movies_title_trgm_idx` and
-- `movies_description_trgm_idx`, with `is_active` in the recheck condition --
-- which is also the proof that the partial predicate matches the query the app
-- actually sends.
--
-- Second: a trigram index is most selective from three characters up, which is
-- where a pattern contains a whole trigram. The app's minimum term is two (see
-- MIN_SEARCH_LENGTH in src/services/searchQuery.ts), and for a two-character
-- term pg_trgm has only padded partial trigrams to work with -- so a two-letter
-- search is the case least likely to use an index, at any size.
