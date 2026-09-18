# Vistora

An app for personal content consumption — live TV, movies, series, anime and
cartoons — built with React Native, TypeScript and Supabase. It runs on
**Android TV** with a remote and on **Android phones and tablets** with a
finger, from one codebase and one APK.

---

## The one architectural rule

**Video never passes through the backend.**

```
React Native TV app
      │
      │  HTTPS (metadata only)
      ▼
Supabase / MovieBox  ──────────► returns metadata + stream_url
      │
      │  the app hands that URL string to the player
      ▼
react-native-video  ──►  Media3 / ExoPlayer
                              │
                              │  direct connection
                              ▼
                       Video CDN / origin
```

Supabase and MovieBox only answer "_where_ is this video?" — the device
fetches the bytes itself. There's no proxy, no relay, no Edge Function in the
media path. `src/player/VideoPlayer.tsx` imports **no** Supabase or database
types; it accepts a `Stream` (a URL, a protocol, an `isLive` flag) and
nothing else.

---

## Requirements

|             |                                                                                        |
| ----------- | -------------------------------------------------------------------------------------- |
| Node        | ≥ 22.11                                                                                |
| JDK         | **17** — the Android Gradle Plugin requires it; 21+ fails with an obscure Kotlin error |
| Android SDK | `platforms;android-37.0`, `build-tools;37.0.0`                                         |
| NDK         | `27.1.12297006` — Gradle installs this automatically on first build (~2.5 GB)          |
| Device      | Android TV emulator (`system-images;android-36;android-tv;x86_64`) or a real TV        |

`android/gradle.properties` pins `org.gradle.java.home` to JDK 17 so the build
doesn't depend on whichever `java` is first on your PATH.

---

## Setup

```bash
npm install
cp .env.example .env
```

Create a Supabase project, fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(**Project Settings → API**), then apply the schema — either `supabase db
push`, or paste `supabase/migrations/*.sql` into the SQL Editor in order (see
[supabase/README.md](supabase/README.md)).

> `.env` is inlined into the JS bundle at build time — restart Metro with
> `npm start -- --reset-cache` after changing it. The anon key is public by
> design; **never** put `SUPABASE_SERVICE_ROLE_KEY` or the DB password in
> `.env`, since everything there ships in the APK.

Then run it:

```bash
npm run android
```

If configuration is missing, the app shows a setup screen instead of
crashing.

---

## Scripts

| Command                                            | Purpose                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| `npm run android`                                  | Build and install the debug APK                     |
| `npm run android:release`                          | Build and install the release APK                   |
| `npm start`                                        | Metro dev server                                    |
| `npm run typecheck`                                | `tsc --noEmit`                                      |
| `npm run lint`                                     | ESLint                                              |
| `npm test`                                         | Jest unit tests                                     |
| `npm run import:iptv`                              | Seed the `channels` table from an iptv-org playlist |
| `python3 scripts/generate-android-icons.py <logo>` | Regenerate every launcher, banner and splash asset  |

---

## Project structure

```
src/
  config/       env.ts — the only file that reads @env
  lib/          the Supabase client; nothing else creates one
  services/     database reads, search, genres, errors, stream resolution
    moviebox/   the MovieBox API client, request signing, paged catalogue feed
    sources/    resolves a ContentItem into a playable Stream
  state/        session-local state — continue watching, my list, player prefs
  types/        database rows, app models + mappers, route params
  hooks/        useAsyncData, useDebouncedValue, useOpenItem,
                usePaginatedData, usePlayItem
  theme/        colours, type scale, the responsive metrics system
  components/   Focusable, ContentCard/Row/RailList, TabBar, CategoryPicker,
                SearchField, HeroBanner, GridFooter, and other shared UI
  player/       the video player: overlay, gestures, remote, settings panel
                — it knows nothing about Supabase or MovieBox
  screens/      Browse (tab host), Home, Catalog, Details, Series, Search,
                Player
  navigation/   native stack (RootNavigator), tabs.ts (content kinds),
                rails.ts (home shelves)
  native/       JS side of the orientation-lock native module
  __tests__/    Jest tests
supabase/
  migrations/   schema, RLS, indexes
scripts/
  import-iptv.mjs             seeds `channels` from an iptv-org playlist
  generate-android-icons.py   source logo → every icon, banner and splash raster
assets/
  vistora-logo.png   the one hand-made image in the repo
```

Data flows one way: `screen → hook → service → supabase / moviebox client →
app models`. `types/content.ts` holds the mapper functions and is the only
place that knows what a raw field is called.

---

## Tabs and content sources

Four routes — `Browse`, `Details`, `Series`, `Player` — with six tabs living
inside `Browse`. Everything comes from the MovieBox API except live TV:

| Tab      | Source                                                     | Card      |
| -------- | ---------------------------------------------------------- | --------- |
| Home     | A shelf per kind, plus continue watching                   | mixed     |
| Live TV  | Supabase `channels` table, filled by `npm run import:iptv` | 16:9 tile |
| Movies   | MovieBox trending, then paged keyword search               | poster    |
| Series   | MovieBox trending, then paged keyword search               | poster    |
| Anime    | A fixed set of MovieBox keyword searches                   | poster    |
| Cartoons | A fixed set of MovieBox keyword searches                   | poster    |

MovieBox has no concept of a live channel, which is the only reason Supabase
still holds a content table. See [STREAM_SOURCES.md](STREAM_SOURCES.md) for
how the MovieBox client and stream resolution work.

The search pill in the top bar queries every searchable tab at once and
shelves the results by kind (Anime and Cartoons share the Movies/Series index,
so they're excluded to avoid repeating rows).

---

## Security model

|                  |                                                             |
| ---------------- | ----------------------------------------------------------- |
| In the app       | `SUPABASE_URL`, `SUPABASE_ANON_KEY` — both public by design |
| Never in the app | service-role key, database password, JWT secret             |
| Read access      | anyone, but only rows where `is_active = true`              |
| Write access     | admins only, via `public.is_admin()`                        |

RLS is deny-by-default, so the absence of an INSERT/UPDATE/DELETE policy for
`anon` is itself the protection. `is_admin()` reads `app_metadata.role`, which
only the service role can set — a signed-in user can't promote themselves.

---

## Why `react-native-tvos`

Core React Native doesn't ship the focus primitives a 10-foot UI needs
(`TVFocusGuideView`, `useTVEventHandler`, TV-correct `Pressable` focus). Those
live in the `react-native-tvos` fork, aliased into the `react-native` name in
`package.json`. The **`overrides` block pinning the same alias is
load-bearing** — without it, npm installs a second copy of React Native
alongside the fork, which breaks TV types in TypeScript and duplicates React
Native at runtime (`Invariant Violation`). Bump the dependency and the
override together.

---

## Notes worth knowing

- **`source.type` is a file extension, not a protocol name.** react-native-video
  maps it to `Util.inferContentType`, so it must be `m3u8`, `mpd` or `ism` —
  not `hls`/`dash`. See `MEDIA3_EXTENSION` in
  [VideoPlayer.tsx](src/player/VideoPlayer.tsx).
- **`BackHandler` doesn't fire under the native stack.** react-native-screens
  pops routes natively, so a hardware Back press never reaches a JS handler —
  screens that need to intercept it use `usePreventRemove` instead.
- **Icons are drawn from `View`s, not fonts or SVGs** (`PlayerIcon.tsx`,
  `SearchIcon.tsx`), to avoid a font/vector dependency for a handful of shapes
  and to sidestep the colour-emoji fallback on Android.
- **Launcher/splash artwork is generated, never hand-edited** — one source
  logo in `assets/vistora-logo.png` produces every icon and splash asset via
  `scripts/generate-android-icons.py`.

---

## Deliberately not built yet

Auth/accounts, EPG, notifications, parental controls, subscriptions, and the
admin dashboard. Continue watching and "my list" are session-local (no
account to persist them to yet). Search is substring matching — it doesn't
rank results or tolerate a typo.
