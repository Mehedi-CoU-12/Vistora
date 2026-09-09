# Vistora

An Android TV app for personal content consumption — live TV, sport, movies and
cartoons — built with React Native, TypeScript and Supabase.

**Phase 1 status:** project foundation, Supabase schema, TV-friendly home screen,
Live TV browser, and a working player. Auth, favourites, watch history, search
and the admin dashboard are deliberately not built yet.

---

## The one architectural rule

**Video never passes through the backend.**

```
React Native TV app
      │
      │  HTTPS (metadata only)
      ▼
Supabase / PostgreSQL  ──────────► returns metadata + stream_url
      │
      │  the app hands that URL string to the player
      ▼
react-native-video  ──►  Media3 / ExoPlayer
                              │
                              │  direct connection
                              ▼
                       Video CDN / origin
```

Supabase answers "*where* is this video?". The device fetches the bytes itself.

There is no proxy, no relay, no Edge Function in the media path, and no Node
server anywhere in the project. Backend bandwidth stays at zero whether one
person is watching or a thousand, and adding a 4K channel costs the backend one
row.

The boundary is enforced by module structure, not by convention:
`src/player/VideoPlayer.tsx` imports **no** Supabase or database types at all.
It accepts a `Stream` — a URL, a protocol, an `isLive` flag — and nothing else.

One consequence to be aware of: since the device connects directly, the stream
host must be reachable *from the TV* and must accept its requests. If a provider
requires a `Referer` or `User-Agent`, that goes in the `channels.stream_headers`
column, not into a proxy.

---

## Requirements

| | |
|---|---|
| Node | ≥ 22.11 |
| JDK | 17 (Android Gradle Plugin requirement) |
| Android SDK | Platform 37, build-tools 37.0.0, NDK 27.1.12297006 |
| Device | Android TV device, or an Android TV emulator image |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project and apply the schema

```bash
# Supabase CLI
supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
```

Or paste `supabase/migrations/0001_initial_schema.sql` then `supabase/seed.sql`
into the SQL Editor in the dashboard. See [supabase/README.md](supabase/README.md).

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` from **Project Settings → API**.

`.env` is read at *build* time and inlined into the JS bundle, so after changing
it you must restart Metro with a cleared cache:

```bash
npm start -- --reset-cache
```

> The anon key is public by design — it grants only what your RLS policies allow.
> **Never** put `SUPABASE_SERVICE_ROLE_KEY` or the database password in `.env`:
> everything there ends up in the shipped bundle, readable by anyone.

### 4. Run

```bash
npm run android
```

If configuration is missing the app does not crash — it shows a setup screen
with the exact steps.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run android` | Build and install the debug APK |
| `npm start` | Metro dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Jest unit tests |

---

## Project structure

```
src/
  config/env.ts          the only file that reads @env
  lib/supabase.ts        the Supabase client; nothing else creates one
  services/              every database read, and the app's error type
  types/                 database rows, app models + mappers, route params
  hooks/                 useAsyncData (loading / error / retry)
  theme/                 colours, 10-foot type scale, TV layout constants
  components/            Focusable, ContentCard, ContentRow, state views
  player/                VideoPlayer — knows nothing about Supabase
  screens/               Home, LiveTv, Player
  navigation/            native stack
supabase/
  migrations/            schema, RLS, indexes
  seed.sql               sample data with public test streams
```

The data flow is one-directional and has no shortcuts:

```
screen → hook → service → supabase client → PostgreSQL
                   │
                   └─► returns app models (ContentItem, Stream), never raw rows
```

`types/content.ts` holds the mapper functions and is the **only** place that
knows what a column is called. Renaming a column touches exactly one file.

---

## Why `react-native-tvos` instead of plain React Native

Core React Native *runs* on Android TV — a TV app is just an Android app — but it
does not ship the focus primitives a 10-foot UI needs: `TVFocusGuideView`,
`useTVEventHandler`, `Platform.isTV`, and TV-correct `Pressable` focus
semantics. Those live in the community fork.

So `package.json` aliases the fork into the `react-native` name:

```json
"react-native": "npm:react-native-tvos@0.87.1-0"
```

The fork tracks upstream closely (0.87.1-0 against core's 0.87.1). Using it means
the D-pad is driven by the **platform's own native focus engine** rather than a
JavaScript focus library, which is why navigation behaves correctly at the edges
of rows without the app computing any geometry.

### The `overrides` block is load-bearing

```json
"overrides": { "react-native": "npm:react-native-tvos@0.87.1-0" }
```

Do not remove this. `@react-native-tvos/virtualized-lists` declares
`peerDependencies: { "react-native": "0.87.1" }` — an exact pin on *upstream*
RN, which the alias does not satisfy. Without the override, npm silently
installs a **second complete copy of React Native** at
`node_modules/react-native/node_modules/react-native`, which causes:

* TypeScript to lose every TV API (the fork adds them via a
  `declare module 'react-native'` augmentation, which then lands on the wrong
  copy), and
* Metro to bundle two React Natives, an `Invariant Violation` at runtime.

When bumping versions, bump the dependency and the override together, then
confirm with:

```bash
find node_modules -name package.json -path "*/react-native/package.json" \
  -not -path "*/react-native-*"
# must print exactly one path
```

---

## TV interface notes

**An Android TV screen is ~960 × 540 dp.** A 1080p panel reports density 2.0 and
a 4K panel 4.0, so both present roughly the same logical viewport. Every size in
`src/theme/layout.ts` is dp against that space, which is why the numbers look
small next to phone values — a 124dp poster is 248 physical pixels at 1080p.

**Overscan.** Many TVs crop a few percent off every edge and cannot be told not
to. The platform never reports this (safe-area insets are 0 on TV, since there
are no system bars), so `overscan` in the theme is applied as padding by hand.
`edgeToEdgeEnabled` is off in `gradle.properties` for the same reason: it is a
phone concept.

**Focus is the whole interface.** A remote gives no other feedback — no cursor,
nothing under a finger. So every interactive element is built from
`src/components/Focusable.tsx`, which signals focus three ways at once: a
coloured ring, a scale change, and a lighter surface. Any one alone fails
someone.

**Focus memory.** Each `ContentRow` wraps its list in a `TVFocusGuideView` with
`autoFocus`. Scroll right to the eighth channel, press down, then up again —
focus returns to the eighth card, not the first. This single prop is most of the
difference between a native-feeling TV app and a ported phone app.

**Virtualization and the D-pad.** In plain React Native, a horizontal `FlatList`
breaks D-pad navigation: the focus engine can only reach views that *exist*, so
focus stops dead at the last rendered cell and the row appears to end early. The
fork's `VirtualizedList` solves this by wrapping the scroller in a focus guide
with `trapFocusLeft`/`trapFocusRight` active while unrendered cells remain, so
focus is held inside the row until it has scrolled and rendered more. That is
why `FlatList` is used here without hesitation.

**Seeking vs. focus.** In the player, left/right scrub **only while the control
overlay is hidden**. While it is visible, the overlay's buttons need those keys
for focus movement — seeking on the same press would scrub the video every time
the user reached for the Back button. Explicit skip buttons cover the
discoverable path, and the physical media keys work in both states.

**No full-screen button.** On a TV the player *is* the screen; the control only
makes sense on a phone, where video shares space with other UI.

---

## Security model

| | |
|---|---|
| In the app | `SUPABASE_URL`, `SUPABASE_ANON_KEY` — both public by design |
| Never in the app | service-role key, database password, JWT secret |
| Read access | anyone, but only rows where `is_active = true` |
| Write access | admins only, via `public.is_admin()` |

RLS is deny-by-default once enabled, so the *absence* of an INSERT/UPDATE/DELETE
policy for `anon` is itself the protection. The `is_active` filter lives in the
policy, not just in app queries — a draft channel is invisible to a client even
if someone crafts their own request with the anon key.

`is_admin()` reads `app_metadata.role` from the caller's JWT. `app_metadata`
(unlike `user_metadata`) cannot be modified by the user, only by the service
role, so a signed-in user has no way to promote themselves.

---

## Sample streams

`supabase/seed.sql` uses public test assets published by their owners for this
purpose: Apple's HLS reference streams, Mux's `test-streams` collection, Unified
Streaming's demo endpoint, Akamai's public test channels, and Blender Foundation
open-movie content. All returned HTTP 200 when written.

Third-party demo endpoints do get retired. If one stops playing, the sample died
— not your player. Replace it with your own source.

---

## Verified so far

* Migration applies cleanly on PostgreSQL 17; all constraints and RLS policies
  tested against a live database, including that `anon` cannot read an inactive
  row or write anything
* Seed is idempotent
* `tsc --noEmit`, ESLint and Jest all pass
* Metro produces an Android bundle (1.6 MB) with the env values inlined and no
  service-role key present

**Not yet verified:** the APK has not been compiled or run on a device, because
this project was scaffolded on a machine without a JDK or the Android SDK.
Nothing about the native build is expected to be wrong, but treat the first
`npm run android` as the real test.

---

## Deliberately not built yet

Auth, user profiles, favourites, watch history / continue watching, search,
EPG, notifications, parental controls, subscriptions, and the admin dashboard.

The schema is shaped to absorb them: every content table already carries `slug`,
`is_active`, `sort_order` and timestamps, so a new content type is a copy of a
known pattern — including its RLS policies — rather than a new invention.
