# Supabase

Vistora reads exactly one thing from Supabase: the `channels` table behind the
Live TV tab. Everything else in the app — Home rails, Movies, Anime, Cartoons,
series, episodes and every playable stream — is fetched from the MovieBox API
at runtime and is never stored here.

MovieBox has no concept of a live channel, which is the only reason this
database still exists.

## Layout

| Path          | What it is                                       |
| ------------- | ------------------------------------------------ |
| `migrations/` | Schema, applied in filename order and tracked in a ledger table |

There is no seed file. The catalogue is not stored, so there is nothing to
seed; the one table the app reads is filled by `npm run import:iptv`.

## Applying the schema

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_initial_schema.sql
```

Or run the **Migrate database** workflow from the Actions tab, which applies
every pending file and records it. Migrations are safe to re-run.

## Filling the channels table

```bash
npm run import:iptv
```

It writes SQL to stdout for the channels it finds on iptv-org; apply that to
the database the same way as a migration.

## Tables the app no longer reads

`movies`, `series`, `episodes`, `sports` and `sports_events` still exist in the
schema but nothing in the app queries them. They are left in place so existing
data is not destroyed by a migration; drop them yourself when you are sure you
want them gone.
