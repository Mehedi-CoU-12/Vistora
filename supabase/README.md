# Database

Two files, applied in order:

| File | Contents |
|---|---|
| `migrations/0001_initial_schema.sql` | enums, tables, indexes, triggers, RLS policies, grants |
| `seed.sql` | sample content for development (idempotent) |

## Applying

### Supabase CLI (recommended)

```bash
supabase link --project-ref <your-ref>
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

`supabase db reset` against a local stack runs the migration and `seed.sql`
automatically.

### Dashboard

Paste `0001_initial_schema.sql` into the SQL Editor and run it, then do the same
with `seed.sql`.

## Seeding real content

`seed.sql` is sample data. Two importers fetch real catalogues instead, each
writing a SQL file of idempotent upserts keyed on `slug` — review it, then apply
it. Re-running refreshes existing rows rather than duplicating them, which
matters because stream URLs rot.

| Script | Source | Fills |
|---|---|---|
| `npm run import:iptv` | [iptv-org](https://iptv-org.github.io/api/) — an index of public stream URLs | `channels` |
| `npm run import:movies` | [archive.org](https://archive.org) — public-domain films | `movies` (`kind = 'movie'`) |
| `npm run import:cartoons` | archive.org — public-domain cartoons | `movies` (`kind = 'cartoon'`) |

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

It needs one repository secret, `SEED_DATABASE_URL`. Take it from **Project
Settings → Database → Connection string → Session pooler**, *not* the direct
connection: Supabase serves direct connections over IPv6 only and GitHub-hosted
runners have no IPv6 route, so a direct string fails with a network error that
looks like bad credentials. That string bypasses RLS, which is why it belongs in
Actions secrets and never in `.env`.

## Tables

```
categories ─┬─< channels
            ├─< movies          (cartoons live here too, via category kind)
            └─< sports_events >─ sports
```

`categories.kind` is what separates content types that share a table: a cartoon
is a row in `movies` whose category has `kind = 'cartoon'`. That is why
`fetchMovies({categoryKind})` filters through `categories!inner(kind)` rather
than a column on `movies`.

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
