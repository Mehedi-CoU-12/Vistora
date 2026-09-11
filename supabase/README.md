# Database

Migrations apply in filename order, then a seed:

| File | Contents |
|---|---|
| `migrations/0001_initial_schema.sql` | enums, tables, indexes, triggers, RLS policies, grants |
| `migrations/0002_add_anime_kind.sql` | adds `'anime'` to `category_kind` |
| `migrations/0003_search_indexes.sql` | `pg_trgm` GIN indexes (optional — see its header) |
| `migrations/0004_add_youtube_protocol.sql` | adds `'youtube'` to `stream_protocol` |
| `migrations/0005_series_and_episodes.sql` | `series` + `episodes`, their RLS and the episode-count trigger |
| `seed.sql` | sample content for development (idempotent) |
| `cleanup_sample_data.sql` | removes everything `seed.sql` inserts, once you have real content |

`0002` and `0004` are alone in their files on purpose: PostgreSQL will not let a
new enum value be *used* in the transaction that adds it, so anything that
inserts a row carrying one has to come after a commit.

## Applying

### Supabase CLI (recommended)

```bash
supabase link --project-ref <your-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

`supabase db reset` against a local stack runs the migration and `seed.sql`
automatically.

### GitHub Actions

`.github/workflows/migrate.yml` — run it from the Actions tab to apply every
migration the database has not had yet, no local Postgres client needed. It
keeps a ledger table, `public.schema_migrations`, holding one row per applied
file, and executes only unrecorded ones; each file and its ledger row go in a
single transaction, so a migration that fails records nothing and changes
nothing. Migration files must therefore not contain their own `begin;` /
`commit;` — the workflow owns the transaction.

| Input | What it does |
|---|---|
| `dry_run` | Lists what would be applied and stops |
| `sample_seed` | Also applies `seed.sql` afterwards |
| `baseline` | Records migrations up to and including this one as applied *without running them* |

`baseline` is for a project set up before the workflow existed: it has the
tables but no ledger, so every migration looks pending and `0001` would fail on
`create type`. Run it once with `baseline: 0002_add_anime_kind` (or whatever the
last migration that database already has is), and later ones apply normally.

### Dashboard

Paste each migration into the SQL Editor and run it in filename order, then
`seed.sql`. Migrations are safe to re-run.

## Removing the sample content

`seed.sql` exists so a fresh clone has something to look at: nine placeholder
channels on Apple's reference HLS streams, six Blender short films, six invented
fixtures. Once you have imported real content they are just noise — and the
channels are the worst of it, since they were inserted first and so sit at the
top of the Live TV grid.

```bash
psql "$DATABASE_URL" -f supabase/cleanup_sample_data.sql
```

It deletes those 21 rows **by slug**, so nothing you imported is at risk
whatever it is called. It prints what it is about to remove before removing it,
runs in one transaction, and is safe to run twice.

It deliberately leaves the **categories** alone, and that is the part worth
understanding: `seed.sql` and the importers share category slugs on purpose
(`import-iptv.mjs` writes `news`, `sports-tv` and `entertainment`;
`import-archive.mjs` writes `action` and `animation`) so re-running an importer
does not reshuffle a rail you have arranged by hand. Those foreign keys are
`on delete set null`, so deleting a category because seed.sql happens to mention
it would quietly move every real channel and film in it to *uncategorised*.
There is an opt-in sweep at the bottom of the file for categories that genuinely
end up empty.

Note that this does not stop the sample data coming back: anything that applies
`seed.sql` again reinserts it — `supabase db reset`, or the migrate workflow
with `sample_seed` ticked.

## Seeding real content

`seed.sql` is sample data. The importers fetch real catalogues instead, each
writing a SQL file of idempotent upserts keyed on `slug` — review it, then apply
it. Re-running refreshes existing rows rather than duplicating them, which
matters because stream URLs rot.

| Script | Source | Fills |
|---|---|---|
| `npm run import:iptv` | [iptv-org](https://iptv-org.github.io/api/) — an index of public stream URLs | `channels` |
| `npm run import:movies` | [archive.org](https://archive.org) — public-domain films | `movies` (`kind = 'movie'`) |
| `npm run import:cartoons` | archive.org — public-domain cartoons | `movies` (`kind = 'cartoon'`) |
| `npm run import:anime` | official YouTube channels + [AniList](https://anilist.co) metadata | `series` + `episodes` |
| `npm run import:anime-pd` | archive.org — public-domain anime *films*; see the warning below | `movies` (`kind = 'anime'`) |

### `import:anime` — series with episodes

Every anime made in the last seventy years is exclusively licensed and no
licensee publishes a stream URL, so the only legal source of full episodes is
the licensors' own YouTube channels: **Muse Asia** and **Ani-One Asia** between
them cover most of what is currently airing for South and Southeast Asia.

The importer walks those channels' *playlists* (a playlist is the channel
telling you where one series ends and the next begins; the uploads feed is
everything interleaved), reads each as a series, and pulls a 2:3 poster from
AniList — YouTube gives a playlist only the 16:9 thumbnail of its first video,
which would letterbox every card in the grid.

Needs a free YouTube Data API v3 key, exported in your shell rather than put in
`.env` (anything reaching `@env` is inlined into the shipped bundle):

```bash
export YOUTUBE_API_KEY=...
npm run import:anime
psql "$DATABASE_URL" -f supabase/seed_anime_series.sql
```

Episodes are stored with `stream_protocol = 'youtube'` and opened in the YouTube
app rather than decoded, so the rights holder receives the view and the ad
revenue. See `src/services/externalPlayback.ts`.

### `import:anime-pd` — the public-domain films

**This one usually comes back empty, and that is expected.** The Archive has no
anime collection, and public-domain anime barely exists: essentially only
pre-1953 Japanese animation has lapsed, and little of it is uploaded with the
explicit licence metadata these scripts require.

```bash
npm run import:anime-pd -- --subjects=anime,manga --license=cc
```

It writes *films*, which have no episodes. The Anime tab loads `series` and
`movies` together and interleaves them alphabetically, so whatever this finds
appears beside the series rather than instead of them.

```bash
npm run import:movies -- --limit=60 --min-year=1930 --max-year=1970
psql "$DATABASE_URL" -f supabase/seed_movies.sql
```

Each script's header comment explains what it refuses to import and why. The
short version: the IPTV importer honours the upstream DMCA/NSFW blocklist, and
the Archive importer requires an explicit public-domain licence in the item's
metadata rather than inferring one from the release year.

### From GitHub Actions

`.github/workflows/seed-content.yml` runs both importers and applies the result,
so you can reseed without a local Postgres client. Trigger it from the Actions
tab; it takes the content type, filters, and a dry-run switch as inputs, and
attaches the generated SQL to the run either way.

It applies any pending migrations first, by calling
`.github/workflows/migrate.yml` — leave the `migrate` input on, because the
generated SQL can need a schema the database has not got yet (importing anime
inserts a category with `kind = 'anime'`, an enum value `0002` adds). Turn it
off only to reseed without touching the schema.

Both workflows need one repository secret, `SEED_DATABASE_URL`. Take it from **Project
Settings → Database → Connection string → Session pooler**, *not* the direct
connection: Supabase serves direct connections over IPv6 only and GitHub-hosted
runners have no IPv6 route, so a direct string fails with a network error that
looks like bad credentials. That string bypasses RLS, which is why it belongs in
Actions secrets and never in `.env`.

## Scraping a site

The importers above each target one catalogue API. `npm run scrape` targets a
*website*, and is split so that changing which website means writing one small
module rather than editing a script or a workflow.

```bash
npm run scrape -- --list                        # what sources exist
npm run scrape                                  # the default: test-videos
npm run scrape -- --source=mysite --limit=100
psql "$DATABASE_URL" -f supabase/seed_scrape_mysite.sql
```

`scripts/scrape.mjs` is the runner, and owns everything that stays the same
whatever site you point it at: throttled fetching, HTML helpers, normalising,
validating against the schema, slugs, deduplication, the liveness probe, and the
idempotent SQL. `scripts/sources/<name>.mjs` owns only what is specific to one
site — where the listing is, and which markup holds the title, the poster and
the stream URL.

The source that ships is `test-videos`: three ten-second open-licensed clips
from [test-videos.co.uk](https://test-videos.co.uk). It is the wiring test,
proving fetch → parse → probe → SQL → psql → a card on the television before you
point the scraper at anything you care about. They arrive in a `Sample Clips`
shelf sorted to the bottom of the Movies tab, and

```sql
delete from public.movies     where slug like 'sample-%';
delete from public.categories where slug = 'sample-clips';
```

takes them out again. Their slugs are prefixed for exactly that reason, and to
keep them from upserting over the `sintel` and `big-buck-bunny` rows that
`seed.sql` already ships.

### Adding a source

Copy `scripts/sources/_template.mjs`, which documents the contract. Export
`meta` — one line of description, the licence you are claiming, and the
categories rows may land in — and `scrape(ctx)`, which returns plain objects.

Sources are allowed to be sloppy: a half-filled item is dropped with a printed
reason rather than written to the database. That `dropped:` list is the thing to
read when a site changes its markup, because it names the field that stopped
being found.

**The one architectural rule applies here too.** Vistora stores a link and hands
it to the device; it never re-hosts, proxies or decrypts. A site whose stream URL
has to be prised out of a signed token or a DRM licence is not one to add — that
is the site saying no, and the link would rot at the next rotation anyway. Check
`robots.txt`, keep `--delay` civil, and put what you find in `meta.license`: it
is copied into the header of the generated SQL, where whoever applies it can see
what they are taking on.

### From GitHub Actions

`.github/workflows/scrape.yml` runs it and applies the result. `source` is a
free-text input rather than a dropdown, so committing a new module is all it
takes to scrape somewhere new — the workflow itself never needs editing.
`options` passes extra flags through to the source (`--quality=1080`); it reaches
Node in an environment variable and is never split by a shell.

Point it at a site for the first time with `dry_run` on: you get the generated
SQL as a run artifact and the database is not touched.

## Tables

```
categories ─┬─< channels
            ├─< movies          (cartoons and anime FILMS live here too,
            │                    via category kind)
            ├─< series ─< episodes
            └─< sports_events >─ sports
```

`categories.kind` is what separates content types that share a table: a cartoon
is a row in `movies` whose category has `kind = 'cartoon'`, and an anime film is
the same row with `kind = 'anime'`. That is why `fetchMovies({categoryKind})`
filters through `categories!inner(kind)` rather than a column on `movies` — and
why adding the Anime *tab* needed one enum value and no new table.

`series` is the one place that trick does not stretch to, and the reason is a
constraint rather than a preference. `movies.stream_url` is `not null`, because
a film you cannot play is not a film; a series has no stream of its own, so
reusing the table would mean making that column nullable for every row to
accommodate the handful that are containers. Split out, each table keeps the
constraint that is true of it — and "tapping this opens a player" becomes
something the schema states rather than something the app checks.

`series.episode_count` is denormalised and maintained by a trigger that
*recounts* rather than incrementing. An increment has to get insert, delete, an
episode moving between series and every rolled-back transaction individually
right, and when it is wrong the only symptom is a number on a card that is
quietly off by one forever.

## Conventions every table follows

Adopting these consistently is what makes adding a content type mechanical:

* `uuid` primary key, `gen_random_uuid()` default — no extension needed,
  `gen_random_uuid()` is core PostgreSQL since v13
* `slug` — unique, constrained by the `public.slug` domain to
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`, safe in URLs and deep links
* `stream_url` — the same name on every playable table, constrained by the
  `public.http_url` domain to an absolute HTTP(S) URL
* `stream_protocol` — stored, not sniffed from the file extension (HLS URLs do
  not reliably end in `.m3u8`)
* `is_active`, `sort_order`
* `created_at`, `updated_at`, with a trigger keeping `updated_at` honest no
  matter who writes the row

## Notable constraints

| Constraint | Why |
|---|---|
| `sports_events_live_requires_stream` | An event marked `live` must have a `stream_url`. This is what prevents "select match → black screen". |
| `sports_events_ends_after_starts` | Catches transposed timestamps. |
| `channels_channel_number_key` | Partial unique index: numbers must be unique *when present*, and most channels have none. |
| `movies.release_year between 1888 and 2100` | A fixed upper bound, not `extract(year from now())`. A CHECK that depends on the current date is re-evaluated on dump/restore, so a row that was legal when inserted can refuse to load years later. |
| `sport_slug ... on delete restrict` | Deleting a sport that still has fixtures is almost certainly a mistake, so the delete fails loudly. |

## Row Level Security

```
READ   rows where is_active = true  →  anyone, including anonymous devices
WRITE  anything                     →  admins only
```

Two things worth understanding:

**The `is_active` filter is in the policy, not just in app queries.** A draft
channel is invisible to a client even if someone bypasses the app and queries
directly with the anon key. `seed.sql` includes a deliberately inactive channel
(`vistora-draft`) so you can confirm this — if it ever appears in the app, the
read policy is not doing its job.

**`is_admin()` is `SECURITY DEFINER` on purpose.** As `SECURITY INVOKER` it only
works when the calling role holds `USAGE` on the `auth` schema; Supabase grants
that today, but depending on it makes every policy fail with a bare
`permission denied for schema auth` if it changes, or when the migration runs on
plain PostgreSQL. `DEFINER` removes the dependency and weakens nothing: the
function takes no arguments and reads only the current request's JWT, so it still
evaluates the caller's identity. The `set search_path = ''` alongside it is what
makes that safe — without it, a caller could shadow `jwt()` and hijack the
elevated context.

### Granting admin

Server-side only, with the service role — never from the TV app:

```ts
await admin.auth.admin.updateUserById(userId, {
  app_metadata: {role: 'admin'},
});
```

`app_metadata` rather than `user_metadata` because users can modify their own
`user_metadata`, which would let anyone promote themselves.

## Regenerating the TypeScript types

`src/types/database.ts` is hand-written so the app typechecks before a project
exists. Once yours is up, generate them instead:

```bash
npx supabase gen types typescript --project-id <your-ref> > src/types/database.ts
```

## Extending

To add a content type — series, documentaries, live radio — copy the `channels`
block and change the specifics:

1. `create table public.<name>` following the conventions above
2. an index on `(category_id, sort_order)` filtered `where is_active`
3. the `set_updated_at` trigger
4. `alter table ... enable row level security`
5. the two policies: public read of active rows, admin manage
6. the grants
7. a row type in `src/types/database.ts` and a mapper in `src/types/content.ts`
8. a fetch function in `src/services/contentService.ts`

Nothing in the app layer needs to change beyond step 7–8, because screens consume
`ContentItem` rather than table rows.
