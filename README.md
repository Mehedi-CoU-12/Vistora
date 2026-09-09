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

These are the versions this project has actually been built and run against:

| | |
|---|---|
| Node | 24.14 (≥ 22.11 required) |
| JDK | **17** — Android Gradle Plugin requires it; 21+ fails with an obscure Kotlin error |
| Android SDK | `platforms;android-37.0`, `build-tools;37.0.0` |
| NDK | `27.1.12297006` — Gradle installs this automatically on first build (~2.5 GB) |
| Device | Android TV emulator (`system-images;android-36;android-tv;x86_64`) or a real TV |

`android/gradle.properties` pins `org.gradle.java.home` to JDK 17 so the build
does not depend on whichever `java` happens to be first on your PATH.

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

## Running on an Android TV emulator

The AVD used for testing was created like this (a **TV** profile matters — a
phone AVD will not exercise leanback behaviour or D-pad focus):

```bash
sdkmanager --install "emulator" "system-images;android-36;android-tv;x86_64"

avdmanager create avd --name Vistora_TV \
  --package "system-images;android-36;android-tv;x86_64" \
  --device "tv_1080p"

emulator -avd Vistora_TV -gpu host
```

Worth setting in `~/.android/avd/Vistora_TV.avd/config.ini`:

```ini
hw.gpu.enabled=yes
hw.gpu.mode=host     # software rendering makes a video app unusable
hw.keyboard=yes      # arrow keys then drive the D-pad
hw.dPad=yes
hw.ramSize=2048
```

Driving the remote from the shell is the fastest way to test focus:

```bash
adb shell input keyevent 19   # DPAD_UP
adb shell input keyevent 20   # DPAD_DOWN
adb shell input keyevent 21   # DPAD_LEFT
adb shell input keyevent 22   # DPAD_RIGHT
adb shell input keyevent 23   # DPAD_CENTER / OK
adb shell input keyevent 4    # BACK
```

To see which element actually holds focus — as opposed to which one *looks*
focused — read the accessibility tree rather than trusting a screenshot:

```bash
adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml
```

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

**Row alignment beats "scroll into view".** Android's default focus scrolling
(`requestChildRectangleOnScreen`) moves the minimum distance needed to reveal the
focused *card* — which leaves the row's heading clipped off the top edge, so the
user cannot see which row they are in. The fix is the fork's item snapping: the
scroller sets `snapToAlignment="item"`, each `ContentRow` marks itself with
`scrollSnapAlign="start"`, and the whole section (heading included) is then
aligned. The fork walks up from the focused view to the nearest ancestor carrying
that prop, which is why the *section* is marked rather than the card.

**Grid cards are fluid, not fixed.** With a fixed card width, whether the last
column fits depends on screen width, sidebar width and padding all agreeing — and
when they do not, the final column is clipped off the right edge. On a TV that is
worse than ugly: the D-pad still moves focus onto that card, so the user's
selection disappears off-screen. `LiveTvScreen` measures its grid and divides the
space, so the row always fills exactly and no column can be cut off.

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

## Verified

Checked against a real PostgreSQL 17 instance and a real Android TV emulator
(Android 16 / API 36, `leanback_only`, 1920x1080 @ density 320):

**Database**
* Migration applies cleanly; every constraint tested (bad slugs, non-HTTP URLs,
  duplicate channel numbers, `release_year` typos, `status='live'` with no
  stream, `ends_at` before `starts_at`, deleting a sport that has fixtures,
  `updated_at` trigger)
* RLS: `anon` reads only active rows and **cannot** see the deliberately
  inactive `vistora-draft` channel; all `anon` writes denied; non-admin
  `authenticated` denied; admin allowed; self-promotion via `user_metadata`
  correctly fails
* Seed is idempotent

**Build**
* `BUILD SUCCESSFUL` — debug APK compiles (50 MB), installs, and the system
  registers it under `android.intent.category.LEANBACK_LAUNCHER`
* `tsc --noEmit`, ESLint and 11 Jest tests pass
* Production bundle is 1.6 MB, contains the publishable key only — no
  `sb_secret_`, no service-role JWT

**On the device**
* Home screen renders live data from Supabase; the native window background
  matches the JS background, so there is no flash on launch
* D-pad left/right moves along a row and the row scrolls to follow
* **Focus memory**: scroll to channel 107, press down then up, focus returns to
  107 — not to 101
* **Row alignment**: the focused row's heading stays on screen
* Live TV grid: 4 columns, nothing clipped, category filter narrows 8 channels
  to 2 without stealing focus from the sidebar
* **HLS playback works** — Apple's BipBop reference stream and a 4K sample both
  decode through Media3, connecting directly to their CDNs
* Scheduled fixtures with no `stream_url` show `NOT STARTED` and do not open the
  player

---

## Gotchas worth knowing

Three things here cost real debugging time. They are documented so they do not
cost it twice.

**`source.type` is a file extension, not a protocol name.** On Android,
react-native-video does `Util.inferContentType("." + type)`. So `type: 'hls'`
becomes `".hls"`, which Media3 does not recognise, so it falls back to the
progressive-download extractors and playback dies with an error that lists every
extractor *except* the one you need:

```
UnrecognizedInputFormatException: None of the available extractors
(FlvExtractor, ... Mp4Extractor, TsExtractor, ...) could read the stream
```

The correct values are `m3u8`, `mpd`, `ism`. `MEDIA3_EXTENSION` in
[VideoPlayer.tsx](src/player/VideoPlayer.tsx) does that mapping. A quick way to
confirm which path a stream took is the module list ExoPlayer logs on release —
`media3.exoplayer.hls` should be in it.

**Fast Refresh cannot survive a changed hook order.** Adding a `useState` in the
middle of a component that is already mounted produces a black screen and:

```
React has detected a change in the order of Hooks called by <Component>
Error: Should have a queue. You are likely calling Hooks conditionally
```

This is not a bug in your code. Force-stop and relaunch the app:
`adb shell am force-stop com.vistora`.

**`adb screencap` cannot always capture video.** The player renders into a
`SurfaceView`, which may come back as pure black in a screenshot even while video
is visibly playing. Do not conclude playback is broken from a black screenshot —
check `logcat` for `ExoPlayerImpl` and `BufferPoolAccessor` activity instead.

## Deliberately not built yet

Auth, user profiles, favourites, watch history / continue watching, search,
EPG, notifications, parental controls, subscriptions, and the admin dashboard.

The schema is shaped to absorb them: every content table already carries `slug`,
`is_active`, `sort_order` and timestamps, so a new content type is a copy of a
known pattern — including its RLS policies — rather than a new invention.
