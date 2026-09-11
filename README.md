# Vistora

An app for personal content consumption — live TV, films and anime — built with
React Native, TypeScript and Supabase. It runs on **Android
TV** with a remote and on **Android phones and tablets** with a finger, from one
codebase and one APK.

**Phase 1 status:** project foundation, Supabase schema, a tabbed browser over
every content kind, search across all of them, and a working player. Auth,
favourites, watch history and the admin dashboard are deliberately not built yet.

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
| `npm run import:iptv` | Build a channel seed file from iptv-org |
| `npm run import:movies` | Build a film seed file from archive.org |
| `npm run import:cartoons` | Build a cartoon seed file from archive.org |
| `npm run import:anime` | Build an anime **series** seed file from official YouTube channels — needs `YOUTUBE_API_KEY` |
| `npm run import:anime-pd` | Build a seed file of the handful of public-domain anime *films* on archive.org |
| `npm run scrape` | Scrape a website for on-demand titles — `-- --list` shows the sources, `-- --source=<name>` picks one |
| `npm run scrape:tmdb` | Build a film seed file from TMDB — catalogue metadata with the official trailer as the stream; needs `TMDB_API_KEY` |
| `python3 scripts/generate-android-icons.py <logo>` | Regenerate every launcher, banner and splash asset from the source logo |

---

## Branding assets

All launcher, banner and splash artwork is **generated**, never hand-edited. One
square source lock-up in `assets/vistora-logo.png` (the V mark above the
"VISTORA" wordmark above the tagline, on its flat navy backdrop) produces
everything:

```bash
python3 scripts/generate-android-icons.py assets/vistora-logo.png
```

| Output | Used by |
|---|---|
| `mipmap-*/ic_launcher_foreground.png` + `mipmap-anydpi-v26/*.xml` | Phone/tablet launcher, API 26+ (adaptive icon) |
| `mipmap-*/ic_launcher_monochrome.png` + `mipmap-anydpi-v33/*.xml` | Android 13+ "Themed icons" |
| `mipmap-*/ic_launcher{,_round}.png` | Launchers below API 26 |
| `drawable-*/banner.png` | The Android **TV home screen** — a TV launcher draws `android:banner`, not the icon |
| `drawable-*/splash_icon.png` | The mark, in the API 31+ platform splash's icon slot |
| `drawable-*/splash_branding.png` | The name and motto, in that splash's branding slot |
| `drawable-*/splash_lockup.png` | The whole lock-up, for the window-background splash |

Three things about this worth knowing before you change any of it:

- **The launcher icon carries the V mark alone.** At 48dp the wordmark is a
  smudge. The script finds the mark by projecting the artwork's non-backdrop
  pixels onto the vertical axis and taking the topmost band of rows; run with
  `--debug` to see the boxes it picked, and `--crop L,T,R,B` to override them.
- **The source's navy backdrop is knocked out to transparency.** An adaptive
  icon's foreground layer *must* be transparent, because the launcher masks it
  into a circle or squircle and composites it over the background layer itself.
- **The splash is entirely native, and there are three launch paths.** Which one
  a device takes is decided by resource qualifiers, not by code:

  | Device | Surface that shows the splash | What it shows |
  |---|---|---|
  | Phone/tablet, API 31+ | the platform's own splash screen | mark in the icon slot, name + motto in the branding slot |
  | Phone/tablet, API 24–30 | `windowBackground` (`drawable/`) | the whole lock-up, centred |
  | Android TV, any API | `windowBackground` (`drawable-television/`) | the whole lock-up, centred |

  From targetSdk 31 the platform draws its own splash at every cold start and
  that is **mandatory** — it cannot be disabled, only styled. Android TV,
  however, does not get one at all. Both facts are load-bearing, and each was
  learned by breaking it:

  *The flicker.* The platform dismisses its splash with a **fade**, as soon as
  the activity's first frame lands — which on React Native is long before the JS
  bundle has loaded. Anything drawing the logo underneath therefore reappeared as
  that fade completed. A frame-by-frame capture of a real launch showed the logo
  drop to almost nothing and snap back to full strength one frame later: that is
  what "the logo shows twice" was. `MainActivity` now takes over the exit
  listener, which both cancels the fade and holds the splash until React has
  actually painted, then removes it in a single frame.

  **Do not assume matching artwork underneath makes the fade safe — it does
  not.** That was the previous fix, and it failed. On the build that produced the
  capture above, the window background behind the splash was already drawing the
  same icon at the same 288dp geometry as `windowSplashScreenAnimatedIcon`,
  confirmed by dumping the resource table of the APK that was actually installed
  at the time, and the frame still dropped out. The fade dips regardless of what
  is behind it. Cancelling it is what fixes this; the matching icon in
  `drawable-v31/` only buys continuity if the safety ceiling fires, so the logo
  stays where it was instead of jumping.

  The hazard worth naming is a held splash over an app that is already running —
  on a returning player, a splash over playing video. Three separate things stop
  it, and it is worth knowing which does what, because only the weakest is code
  of ours:

  1. `configChanges` declares orientation, screenSize, screenLayout,
     smallestScreenSize and uiMode, so the framework reconfigures this activity
     in place instead of recreating it. The player's landscape lock and PiP
     enter/exit are all changes in that set, so none of them reach `onCreate` at
     all.
  2. Even on a genuine recreate, `setOnExitAnimationListener` only fires when the
     platform actually *presented* a splash, and it presents one for launches,
     not for reconfiguration. No splash, no hold. This is the protection that
     survives someone narrowing `configChanges` later.
  3. The hold releases immediately if the React root already has children.

  Note what (3) does and does not cover. A recreate builds a *new* React root,
  empty at first, so this check would not catch that case — it catches a listener
  firing on an activity whose UI is already up. It is the last layer, not the
  first.

  And note it asks "has React painted", not "was this recreated". A warm relaunch
  from the launcher does get a splash and does often carry saved instance state,
  so gating on `savedInstanceState` would skip the hold exactly where it is
  needed and let the fade back in.

  *The dark TV.* The first attempt at the above set `windowBackground` to a flat
  colour on API 31+, reasoning that the platform splash covered the whole load.
  On Android TV, which has no platform splash, that produced a plain dark screen
  and no logo for the entire bundle load. Hence `drawable-television/`, which the
  resource system prefers over `drawable-v31/` because the UI-mode qualifier
  outranks the platform-version qualifier.

  *No JS splash.* A JS splash cannot start until the bundle has loaded, which is
  the wait it would exist to cover, so it can only draw the logo a second time
  after a native splash already did. That was the third layer in the original
  bug.

  The icon slot is a fixed 288dp square whose artwork must stay inside an inner
  192dp circle, which is why `SPLASH_ICON_DP` / `SPLASH_ICON_SCALE` are not free
  choices, and why the name and motto go to the branding slot rather than being
  crammed into the icon where they would be clipped and illegible.

---

## Navigation: three routes, four tabs

The stack has three routes — `Browse`, `Series` and `Player` — and everything
browsable lives behind tabs inside `Browse`:

| Tab | Content | Card |
|---|---|---|
| Home | A shelf per kind, twelve items each | mixed |
| Live TV | `channels` | 16:9 tile |
| Movies | `movies` where the category is `kind = 'movie'` | poster |
| Anime | `series` **and** `movies` where `kind = 'anime'` | poster |

`Series` is the only screen between browsing and playing, and it earns the
depth: an episode list cannot be a tab (there is one per series) and should not
be a modal over the grid (it is where you spend time, not a glance). Back from
an episode returns you to the list you chose it from.

Sport is not a tab of its own: sports channels are Live TV categories, so they
are browsed there rather than in a second place. `cartoon` remains a
`category_kind` in the schema and `npm run import:cartoons` still works, but
nothing browses it — the Anime tab covers what that tab was for.

**The tabs are component state, not navigator routes.** Routes would push a
screen per switch, so Back would walk you through your own browsing history one
tab at a time, which is not what a tab bar means anywhere.
`@react-navigation/bottom-tabs` would fix that and bring a bottom bar this app
cannot use on a television, plus a dependency to style around. So `BrowseScreen`
owns one piece of state, and Back does the one thing it should: return to Home
from anywhere, leave the app from Home.

**Every tab but Home is the same screen.** `CatalogScreen` is a category filter
beside a grid; what differs between Live TV and Anime is which query fills it,
which categories the filter offers, and whether the artwork is a poster or a
tile. All three are fields on a `CatalogSpec` in `src/navigation/tabs.ts`, which
is the single list of what this app browses — `HomeScreen` derives its shelves
from the same array, so a new content kind gets a tab *and* a shelf, or neither.

**A visited tab stays mounted on touch and is unmounted on TV.** On a phone that
keeps scroll position and the selected category, which is what a tab bar implies.
On a TV it would be a bug: a hidden subtree's cards stay in the platform's focus
tree, so the D-pad could walk out of the visible grid into a tab that is not on
screen and leave nothing highlighted anywhere.

---

## Anime: series, episodes, and where they legally come from

The Anime tab used to be a shelf of one-offs, because the unit of anime is not
a title — it is a title with twenty-six of them inside it. It now browses
`series`, each of which opens an episode list.

### There is no source that gives you "any anime"

Worth stating plainly, because it is the question that leads here. Everything
made in the last seventy years is **exclusively licensed** — Crunchyroll,
Netflix, Disney+, HIDIVE — and none of those publish a stream URL or an API a
third party can read. The sites that do offer any anime on demand are
unlicensed restreams: they break the same rule the iptv-org blocklist and the
archive.org licence filter exist to enforce, they rot within weeks (which is
what every importer's liveness probe is for), and they are the one category of
source that gets an app removed rather than merely broken.

Two legal routes remain, and the app uses both.

### 1. Official YouTube channels — real series, real episodes

Several licensors publish full episodes free, with subtitles, on their own
channels. **Muse Asia** and **Ani-One Asia** between them cover most of what is
currently airing, licensed for South and Southeast Asia — which includes
Bangladesh, the country `import-iptv.mjs` already defaults to.

`npm run import:anime` walks those channels' **playlists** (not their uploads
feed — the feed is every episode of every show interleaved, whereas a playlist
is the channel telling you where one series ends and the next begins), reads
each playlist as a series, and enriches it from [AniList](https://anilist.co)
for the thing YouTube cannot provide: a 2:3 poster. A playlist's only artwork is
the 16:9 thumbnail of its first video, so without that step every card in the
grid is a letterboxed still.

It needs a free YouTube Data API v3 key. A full run costs a few hundred units
against a 10,000/day quota:

```bash
export YOUTUBE_API_KEY=...            # see the header of scripts/import-anime.mjs
psql "$DATABASE_URL" -f supabase/migrations/0004_add_youtube_protocol.sql
psql "$DATABASE_URL" -f supabase/migrations/0005_series_and_episodes.sql
npm run import:anime
psql "$DATABASE_URL" -f supabase/seed_anime_series.sql
```

The migrations must go first, and separately: PostgreSQL will not let a new enum
value be *used* in the transaction that adds it.

### 2. Public-domain films — `npm run import:anime-pd`

The archive.org path still exists and still works, and still returns almost
nothing: only pre-1953 Japanese animation has lapsed, and little of it carries
the explicit licence metadata that importer requires. It writes *films*, which
have no episodes and are not series in any useful sense — so the Anime tab
loads both tables and interleaves them alphabetically. A tab that showed one and
not the other would be lying about what is in the library.

### `youtube` is a protocol, and it means "do not decode this"

A `youtube.com/watch` URL is an HTML page, not media. The video behind it is
reachable only by defeating a signature scheme that exists to stop exactly that
— against YouTube's Terms of Service, and in practice a player that breaks every
few weeks. So the app does not try: `stream_protocol = 'youtube'` routes through
`src/services/externalPlayback.ts`, which opens the link in the YouTube app,
where the rights holder is credited with the view and collects the advertising
that pays for the episode to be free.

This does not bend [the one architectural rule](#the-one-architectural-rule) —
it restates it. Supabase still stores nothing but a link and this app still
never touches a byte of video. Only the component consuming the link differs,
and it differs *because* pretending otherwise is what would break the rule.

### Why `series` and `episodes` are new tables

The cheap version is `movies.parent_id` plus an episode number. It is wrong for
a reason visible in the very first constraint: `movies.stream_url` is `not
null`, because a film you cannot play is not a film. A series has no stream of
its own, so the self-referencing version has to make that column nullable for
every row in the table to accommodate the few that are containers — trading a
real guarantee about 100% of films for convenience about the parents.

Split in two, each table keeps the constraint that is true of it. "Tapping this
opens a player" stops being a runtime check and becomes something the schema
states.

One consequence worth knowing: a series and an unpublished fixture both have
`stream: null`, and they mean opposite things. The card used to infer "broken"
from that and would have stamped *Not started* on every show in the Anime tab,
so the distinction is now carried explicitly by `ContentItem.unavailableLabel`.

---

## Search

A magnifier pill in the top bar searches every content kind at once — channels,
films and anime — and shows the matches as a shelf per kind:

```
VISTORA.        Home  Live TV  Movies  Anime               (Q)

(Q) iron|                                              [Clear]

Live TV · 1 channel      [tile]
Movies · 2 films         [poster] [poster]
Anime · 1 title          [poster]
```

**The magnifier is drawn, not typed or imported.** `player/PlayerIcon.tsx` sets
the rule: no icon font (a build-config change) and no SVG library (a native
dependency) to ship a handful of shapes to a TV, and nothing from an emoji block
either — Android renders those through the colour emoji font, so U+1F50D would
arrive as a full-colour pictogram at a size and weight nothing else on screen
shares. There is no usable magnifier among the geometric characters: U+2315 is
the closest and is not in Roboto's coverage on every Android build, so the
failure mode is a tofu box — worse than the word it replaced. So
`components/SearchIcon.tsx` draws it from two Views, a bordered circle and a
rotated bar: no asset, no dependency, identical on every device, and size and
colour are props rather than font metrics. The player's whole icon set is drawn
the same way, for the same reasons.

This is not a reversal of `TabBar`'s **labels rather than icons**. That argument
is specifically that the *tabs* are content kinds whose distinctions — anime
against films, a channel against either — have no pictogram anyone would read
correctly. Search is the opposite case: the magnifier is the one pictogram that
is unambiguous at three metres and at thirty centimetres, and it is what every TV
platform already uses here. Since the pill no longer says anything out loud,
`TextButton`'s props make the accessible name a *type-level* requirement — a
button with an `icon` and no `label` will not compile without an
`accessibilityLabel`.

**Search is a mode over the tabs, not one more tab.** `TABS` means "the content
kinds this app browses", which is the property `HomeScreen` and `SearchScreen`
both rely on when they derive their shelves from it — search is not a kind, it is
a question asked of all of them. There is a measurable reason too: a phone in
portrait puts the tab bar along the bottom, where the pills divide a 390dp screen
between them — at six of them that is about 60dp each, which a label like
"Cartoons" only just fits, and one more ellipsises them all. Every entry in
`TABS` takes width from every other, so search would arrive by making navigation
to everything else worse. As a mode it costs no navigation width at
all, and closing it returns you to the tab you were on, still scrolled where you
left it.

**A shelf per kind, not one merged list.** A channel is a 16:9 tile and a film is
a 2:3 poster, so a merged grid would have to pick one shape and stretch the
other. Grouped by kind, each group keeps its own card shape and its own count, so
"is this film in here?" is one glance rather than a scan of interleaved results.

**The groups are derived, not listed.** `SearchScreen` maps over `catalogTabs()`
and calls each spec's own loader with a `search` option, so it names no content
kind anywhere in the file — adding one to `navigation/tabs.ts` makes it
searchable with no edit there. That is the same derivation `HomeScreen` uses, and
it matters more here: a kind missing from search looks exactly like a kind with
nothing in it, so the bug would never be reported.

**Queries are debounced by 300ms and need two characters.** On a phone the
debounce saves six wasted requests per word. On a TV it does something the user
can see: results are shelves, so a query per keystroke reflows the layout
underneath whatever the D-pad had focused.

**The field claims initial focus; the results do not.** `ContentRow` is not given
`isFirstRow` on this screen, so the first result card never seeds focus — a card
stealing it mid-search would send the next keystroke to the focus engine instead
of the query. On TV the field takes `hasTVPreferredFocus`, which gives it D-pad
focus *without* opening the leanback IME over the results; on a phone it takes
`autoFocus` instead, because arriving at a search screen and then having to tap
the field is a wasted tap.

**What each kind matches** — the lists live in `*_SEARCH_COLUMNS` in
`services/contentService.ts`:

| Kind | Columns |
|---|---|
| Live TV | `name`, `description` |
| Movies / Anime | `title`, `description` |
| Sports (`fetchSportsEvents`, no tab) | `title`, `competition`, `home_team`, `away_team` |

`channels.channel_number` is deliberately absent — it is an integer column and
`ilike` on one is a cast away from a 400, and the Live TV grid is already ordered
by exactly that number. `sports_events.sport_slug` is absent for a different
reason: it is a machine key, so searching it would make "foot" return every
football fixture in the database and bury the team the user typed half of.

**The term is quoted, and that is not cosmetic.** Searching several columns means
`or=(name.ilike.X,description.ilike.X)`, and PostgREST parses that list with `,`
as the separator and `()` as grouping — so an ordinary title like "Crouching
Tiger, Hidden Dragon" or "Alien (1979)" would be read as filter syntax. The
value is wrapped in double quotes, with any quote inside it escaped, by
`services/searchQuery.ts`, which is a separate module precisely so that string
surgery is unit-tested rather than checked against a live database. (It is not
about SQL injection: supabase-js sends the value as a query-string parameter and
PostgREST binds it into a prepared statement.)

Backslashes are stripped from the term, which *is* load-bearing: `\` is `LIKE`'s
escape character, so a term ending in one produces `'%foo\%'` and PostgreSQL
raises "LIKE pattern must not end with escape character" — a 500 from a stray
keystroke. `%`, `_` and `*` are left alone and reach `ILIKE` as wildcards, which
only ever broadens a match.

**Performance is a sequential scan, and at this scale that is the right plan.**
`ilike '%term%'` cannot use a btree index — a leading wildcard means the match
can start anywhere, so btree's ordering is no help — so PostgreSQL scans.
Measured with `explain (analyze)` on PostgreSQL 18, against the exact query
`contentService` generates:

| Table size | Plan chosen | Time |
|---|---|---|
| 10,000 channels | seq scan | ~14ms |
| 20,000 movies | seq scan | ~5ms |
| 200,000 movies | BitmapOr over two trigram indexes | ~1.6ms (vs ~79ms scanning) |

So a personal library — even a full iptv-org channel import — is already faster
than the 300ms debounce in front of it.
`supabase/migrations/0003_search_indexes.sql` adds the `pg_trgm` GIN indexes
those last two rows compare; it is **optional**, the app behaves identically with
or without it, and below roughly a hundred thousand rows in one table the planner
ignores the indexes and is right to. Treat it as insurance against a library that
grows, not a fix for something currently slow.

> **Partly verified.** `tsc`, ESLint and 178 Jest tests pass, and migration 0003
> was applied to a real PostgreSQL 18 instance — twice, to confirm it is
> idempotent — where the forced plan is the expected `BitmapOr` with `is_active`
> in the recheck condition, confirming the partial indexes match the app's query.
> But unlike everything in [Verified](#verified) below, the *UI* has not been
> driven on a real Android TV or phone: the D-pad path from the field into the
> results and the leanback IME are unexercised.

---

## Project structure

```
src/
  config/env.ts          the only file that reads @env
  lib/supabase.ts        the Supabase client; nothing else creates one
  services/              every database read, the app's error type, the
                         search-term → PostgREST filter translation, and the
                         hand-off for streams the app must not decode itself
  types/                 database rows, app models + mappers, route params
  hooks/                 useAsyncData (loading / error / retry), useDebouncedValue,
                         useOpenItem (what selecting a card does, in one place)
  theme/                 colours, type scale, and the responsive metrics system
  components/            Focusable, ContentCard, ContentRow, TabBar,
                         CategoryPicker, SearchField, SearchIcon, state views
  player/                the player: overlay, gestures, remote, settings panel
                         — and it knows nothing about Supabase
  screens/               Browse (the tab host), Home, Catalog, Series, Search,
                         Player
  navigation/            native stack + tabs.ts, the list of content kinds
supabase/
  migrations/            schema, RLS, indexes (0003 is optional: search indexes;
                         0004 adds the 'youtube' protocol, 0005 series+episodes)
  seed.sql               sample data with public test streams
scripts/
  import-anime.mjs            official YouTube channels → series + episodes
  animeTitles.mjs             episode-number parsing; the one silently-failing
                              step, so it is the one with unit tests
  generate-android-icons.py   source logo → every icon, banner and splash raster
assets/
  vistora-logo.png       the one hand-made image in the repo
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
are no system bars), so the TV gutter in the theme is applied as padding by hand.
A phone has the opposite problem — nothing crops it, but its status bar,
navigation bar and cutout are all real — so the two devices take different
margins from different sources. See [Responsive layout](#responsive-layout-one-codebase-two-devices).

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

**Seeking vs. focus.** In the player, left/right scrub only when nothing else
wants those keys: while the overlay is **hidden**, or while the **scrub bar has
focus** (it sits alone on its row, so left and right have nowhere to move focus
to anyway). While the overlay is up and a button has focus, the same keys move
focus — seeking as well would scrub the video every time the user reached for
Back. Explicit skip buttons cover the discoverable path, and the physical media
keys work in every state. See [The player](#the-player).

**No full-screen button.** The player is a route of its own on every device, so
it is already the whole screen and the control would have nothing to do. What a
phone gets instead is the picture-size control, which is the question people
actually have on a 20:9 screen: letterbox the frame, or crop it to fill.

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
selection disappears off-screen. `CatalogScreen` measures its grid and divides
the space (`theme/grid.ts`), so the row always fills exactly and no column can be
cut off. That arithmetic is checked against every layout and every card variant
in `src/__tests__/gridLayout.test.ts` — it has to be, now that the column count
varies by variant as well as by screen.

---

---

## Responsive layout: one codebase, two devices

One APK has to be a 10-foot UI on a television and an ordinary touch app on a
phone. Those are not the same layout with different padding — a 216dp sidebar is
a quarter of a TV screen and more than half a phone screen — so the difference is
resolved in exactly one place and read everywhere else.

### Orientation is set in code, not the manifest

`android:screenOrientation` is a single static manifest attribute. It takes no
resource qualifier, and the same APK installs on both devices, so it cannot
express even two answers, let alone three. The manifest therefore declares
nothing, and `DeviceOrientation` owns the policy:

| When | Policy | Why |
|---|---|---|
| TV, always | `SCREEN_ORIENTATION_LANDSCAPE` | A television is landscape and nothing else. Pinning it means no stray sensor reading or `adb shell` rotation can hand a 10-foot UI a portrait window. |
| Phone, browsing | `SCREEN_ORIENTATION_USER` | Portrait in an upright hand, landscape when turned — and it honours the rotation lock in quick settings. `FULL_SENSOR` would override that lock, which is not ours to override while merely browsing. |
| Phone, video on screen | `SCREEN_ORIENTATION_SENSOR_LANDSCAPE` | A 16:9 stream in a portrait window is a band across the middle with two thirds of the display unused. `SENSOR_` so the phone can be held either way up; a viewer who turns it the "wrong" way gets a correct picture, not an upside-down one. |

`MainActivity.onCreate` applies the resting policy (the first two rows) before
`super.onCreate`, so the window is created with its final orientation rather than
laying out at the wrong aspect ratio and reflowing — on a phone that reflow is a
visible flash of the wrong layout.

The third row is the one exception where the app overrides the owner's rotation
lock, and it is deliberate: a locked-portrait phone is exactly the case the
policy exists to answer. It is applied by `PlayerScreen` through a small native
module, `OrientationModule`, which is two calls to `setRequestedOrientation` and
knows nothing about video — the decision of *when* belongs to the screen that
knows a player is mounted.

**Why the lock lives in `PlayerScreen` and not in `VideoPlayer`.** Same reason as
Back interception: "which way up is the device" is a property of the screen the
player happens to be filling, not of playback. The same component embedded in a
preview pane must not rotate the phone. Keeping it out is what lets `VideoPlayer`
import nothing from navigation and nothing from the platform. It uses
`useFocusEffect` rather than `useEffect`, because under a native stack the screen
behind stays mounted — a mount-scoped effect would hold the phone landscape
underneath anything later pushed on top of the player.

**Why a hand-written module rather than an orientation library.** It would be the
project's only native dependency that has to be re-verified against the
react-native-tvos fork on every bump, in exchange for two lines of stable Android
API. The JS wrapper optional-chains every call, so a bundle newer than the
installed APK costs a video its landscape lock instead of throwing.

The television test is
`UiModeManager.getCurrentModeType() == UI_MODE_TYPE_TELEVISION`, which is
deliberately the *exact* test React Native uses for `Platform.isTV` (see
`AndroidInfoModule.uiMode()`). Matching it is the point: JS branches its whole
layout on `Platform.isTV`, so a native check using some other signal —
`FEATURE_LEANBACK`, say, which a phone can report and a Fire TV can omit — could
leave a device with a landscape lock and a phone layout, or the reverse.

**Rotating does not recreate the activity.** `android:configChanges` lists
`orientation`, `screenSize`, `screenLayout` and `smallestScreenSize`, so the
window is reconfigured in place; React Native turns that into a dimensions event
and the tree re-renders with new metrics. Navigation state, scroll offsets and
playback all survive a turn of the phone.

### `useMetrics()` is the only thing that knows the screen size

`src/theme/metrics.ts` turns a window size into every screen-dependent value, and
`MetricsProvider` re-resolves it when the window changes. What varies:

| | TV | Phone (portrait) | Phone (landscape) |
|---|---|---|---|
| Screen padding | 48 / 27dp overscan | 16 / 12dp + real system insets | 24 / 12dp + insets |
| Poster card | 124 × 186dp, fixed | ~2.8 across, fluid | ~7 across, fluid |
| Channel grid | 4 columns | 2 columns | 4 columns |
| Poster grid | 5 columns | 3 columns | 6 columns |
| Category picker | sidebar | chip rail | sidebar |
| Tab bar | top rail | bottom bar | top rail |
| Headline sizes | reference scale | ×0.78 | ×0.78 |
| Body / caption | reference scale | unchanged | unchanged |
| Interaction cue | focus ring + grow | press ring + shrink | press ring + shrink |
| Min tap target | none | 48dp | 48dp |

Three of those are worth explaining:

- **TV card sizes are fixed, everything else is fluid.** Every Android TV
  presents ~960dp whether the panel is 1080p or 4K, so there is nothing for a
  fluid width to adapt to — and 124 × 186 is the size checked on a real device,
  with the row density and focus ring it was tuned for. Touch card widths are
  divided out of the measured content width instead, at a deliberately
  *fractional* count: a partly visible card at the right edge is the strongest
  available "this row scrolls" cue, and on a phone it is the only one, there
  being no D-pad to nudge and find out with.

- **Only the headlines scale down.** The reflex is to shrink the whole type
  scale for a small screen, and it is wrong here: dp is a physical unit, and a
  phone is ~10× closer but its pixels are ~2.5× smaller, so 15dp of body text is
  legible on both. What does not survive is type sized against the *width* of the
  screen — `display` at 34dp is 3.5% of a TV's viewport and 8.7% of a 390dp phone.

- **Overscan and safe-area insets are opposite problems, and each device has
  only one.** A TV crops a few percent of every edge and reports zero insets, so
  its margin has to be a hard-coded design constant. A phone crops nothing, so
  48dp a side would be a quarter of its width wasted — but its status bar,
  navigation bar and cutout are real, and the app targets SDK 36 where the
  platform draws edge-to-edge regardless. `ScreenContainer` owns the insets; the
  screens own the gutter.

### The rule that keeps it honest: no module-scope constant may know the screen

`Dimensions.get('window')` at import time is a snapshot taken before the first
render and never updated again, so a rotation leaves every `StyleSheet` built
from it silently wrong. That is why the metrics are a pure function of the window
size, and why component styles are built through `makeStyles`:

```ts
const useStyles = makeStyles(m => ({
  heading: {...m.typography.sectionTitle, paddingHorizontal: m.gutter.horizontal},
}));

function Row() {
  const styles = useStyles();
}
```

`makeStyles` caches the built sheet in a `WeakMap` keyed on the metrics object,
which the provider keeps referentially stable. So the factory runs once per
component per window size no matter how many instances mount — forty cards on a
screen share one sheet — and the entry for the old size is collectable as soon as
the rotation is over. Inline style objects would lose the sheet and allocate per
render; a `useMemo` per component would rebuild the same sheet once per instance.

`resolveMetrics` is pure and exported separately from the hook, so
`src/__tests__/metrics.test.ts` exercises it against arbitrary viewports without
rendering anything — including pinning the verified TV numbers, so a layout
regression fails a test instead of clipping a column on somebody's television.

### The two things that change shape

**The category picker.** `CategoryPicker` swaps its sidebar for a horizontal chip
rail below 700dp of content width. Note the test is on available *width*, not on
device class: a phone in landscape has ~796dp and keeps the sidebar, which is
right, because vertical space is what that window is short of and a sidebar costs
none of it.

**The tab bar.** `TabBar` is a rail of pills across the top on a TV and in any
landscape window, and a bar along the bottom on a touch device held upright.
Neither placement is a preference. A television has no thumb for a bottom bar to
be near, and the bar has to be somewhere focus reaches by pressing UP out of the
content — which is the top of the screen by definition. A landscape window is
short of height, where 56dp along the bottom is a seventh of a phone's 390dp
spent on navigation nobody is looking at. Upright, the bottom is the part of a
tall screen a thumb reaches without regripping.

Everything else only changes size. A vertical stack of horizontal shelves is
what a phone media app looks like too, so `HomeScreen` needed no branch — beyond
turning off the fork's focus-driven item snapping, which has nothing to trigger it
on a phone but would still make a flick of the wrist stick to row boundaries.

### Touch gets the same three cues, driven from a different input

`Focusable` is the one interaction primitive, and it collapses focus and press
into a single `active` flag so no consumer needs a `Platform` check. On a TV,
focus is the whole interface and persists while the user decides; on a phone
there is no focus at all and the only feedback that matters is confirmation that
the tap landed. Same ring, same lighter surface, and the scale goes the other
way: a TV card grows to say "you are here", a phone card shrinks to say "I felt
that".

The two states are tracked separately rather than as one flag, because a D-pad
produces both — pressing OK on a focused card fires `onPressIn`/`onPressOut` as
well as holding focus, and collapsing them would let the press-out strip the ring
off a card the user is still sitting on.

---

## The player

The player is the one screen where the two devices differ by more than layout,
because its controls are not always on screen. A remote has keys that can wake
them; a finger has nothing to press but the video itself. So the two input models
live in their own modules, and `VideoPlayer` owns only the state they both act
on:

```
src/player/
  VideoPlayer.tsx        playback state, and nothing about input
  useRemoteControl.ts    D-pad + media keys          (TV)
  usePlayerGestures.ts   tap, double-tap, swipe,     (touch)
                         press-and-hold, pinch
  PlayerControls.tsx     the overlay: three zones, both devices
  SeekBar.tsx            draggable on touch, focusable on TV
  SettingsPanel.tsx      speed, picture size, audio, subtitles
  GestureFeedback.tsx    the readouts a gesture needs and a button does not
  ControlButton.tsx      focus (TV) and press (touch) in one control
  PlayerIcon.tsx         the icon set, drawn from Views
  Scrim.tsx              the gradient behind the controls
  useOverlayFade.ts      the overlay's fade, and why a TV only gets half of it
  playbackOptions.ts     rates, scaling modes, track labels, clamping — pure
  playerLayout.ts        control sizes per device, scrim heights, edge padding
```

What is deliberately **not** there is a layer unifying the two input systems. A
"player command" abstraction over both sounds tidy and is where TV players go
wrong, because the interesting behaviour is exactly the part that differs: what a
key press means depends on what has focus, and what a tap means depends on where
it landed.

### On a phone: the video surface is the control surface

| Gesture | What it does |
| --- | --- |
| Tap | Show / hide the controls |
| Double-tap left / right | Skip 10s back / forward — repeat to accumulate |
| Double-tap centre | Play / pause |
| Swipe horizontally | Scrub, with a live preview, committed on release |
| Swipe vertically, right half | Volume |
| Swipe vertically, left half | Brightness |
| Press and hold | 2× speed while held |
| Pinch | Cycle picture size: Fit → Fill → Stretch |

All eight live on one `PanResponder`, because a gesture is claimed by exactly one
responder and the claim happens *before* anyone knows what the gesture will turn
out to be. Two overlapping responders — one for taps, one for drags — means
whichever claims first wins and the other never fires; the classic symptom is a
double-tap that only works when your thumb is perfectly still.

The layer order underneath is load-bearing: video, then the dimming layer, then
the gesture layer, then the controls with `pointerEvents="box-none"`. A press on
a button is handled by the button, and a touch anywhere else falls through to the
gesture layer. Without `box-none` the overlay would swallow every touch and no
gesture would ever fire while the controls were up.

### Skips accumulate; they are not issued per press

Every skip — button, double-tap, arrow key, media key — adds to a *pending*
target and restarts a 700ms timer. The seek is issued once, when the user stops.
Two reasons, both of which you feel immediately on a real stream:

* A seek on an HLS source costs a segment fetch and a decoder flush. Six presses
  issued separately means six of those, and the picture stutters through five
  positions nobody asked to see.
* A held-down remote key repeats at about twenty presses a second.

So holding RIGHT builds up `+40s` in the overlay and commits it once. The pending
target is dropped in `onSeek`, when Media3 confirms the jump — not when the seek
is issued, which would snap the bar backwards for the couple of hundred
milliseconds a seek takes to land.

### A live stream is not a film with an unknown length

`duration` is 0 or `Infinity` on a live playlist. What is actually addressable is
the sliding DVR window the server still holds, which arrives as
`seekableDuration` in `onProgress` — so the bar is drawn against that, not
against the duration.

A live playlist always reports *some* seekable duration, typically three
segments, which is just the decoder's own buffer. Offering a scrub bar over 12
seconds is offering a control with nowhere to go, so under 90 seconds the player
says "this stream has no rewind window" and shows no bar at all. Above it, the
bar appears, the readout switches to how far behind the edge you are, and a **Go
live** button appears once you are more than 20 seconds back.

### Brightness dims the video, not the backlight

Changing the screen's real brightness needs a native module this project does not
have, and it would change it for the whole system. The gesture drives a black
layer over the video instead, which is honest about what it does — and it stops
at 15%, because a swipe that ends in a black screen with the sound still playing
is indistinguishable from a crash.

### Lock is a real mode, not a disabled overlay

The point of the lock is that a pocket, a sleeve or a passenger cannot change
anything, so while it is on there is exactly one control on screen and no gesture
touches playback. The one thing a tap *must* still do is bring the Unlock button
back: the overlay auto-hides after four seconds, and a lock that hid its own way
out would be permanent.

### A seek must never move the bar backwards

A seek does not land instantly, and both events that report one can carry a
position from *before* the jump. In react-native-video's Android code `onSeek`
fires from `onIsPlayingChanged` and reads `player.getCurrentPosition()` at the
moment playback resumes; `onProgress` meanwhile keeps ticking on its own 500ms
timer while Media3 flushes its decoder.

Dropping the target when `onSeek` arrived therefore handed the bar a stale
position for up to half a second: it snapped back to where the finger started,
then jumped forward again — plainly visible when scrubbing by dragging the bar.
So the player holds the pending target until a reported position is
demonstrably near it (`hasSeekLanded`, 1s tolerance), with a 4s safety valve for
a target that never lands. The readout only ever moves the way the user asked.

The buffering spinner is delayed 250ms for the same reason: every seek buffers
briefly, and a spinner that flashes for 150ms on each one is a flicker of its
own.

Two other things could put the bar back at zero, and both are now refused rather
than guessed at. `timeForTrackX` returns **null** when it has no measurement or
the timeline has no length, because answering "the start of the timeline" is
indistinguishable from a deliberate jump to the beginning — a control that does
not know where it is should do nothing. And `onProgress` reporting a
`seekableDuration` of 0, which Media3 does transiently around a seek and while a
live playlist reloads, is ignored rather than stored: a zero-length timeline
collapses the fill to the far left and maps every position on the bar to zero.

### Three zones, not one long row

Everything used to live along the bottom: the scrub bar, then a single row
holding play, skip, speed, picture size, lock, settings and back. That is where a
player overlay goes wrong, because one row mixes two kinds of control that want
opposite things — the ones a hand reaches for constantly, and the ones set once
per film and then forgotten. Eight of them in a line is a row too long to scan, a
row in which Back sits one slip away from Pause, and a row that has to shed its
text labels to fit on a phone.

So controls are placed by how often they are used. The zones are the same on both
devices; the one thing that moves between them is the transport.

```
  TV                                        Phone
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│ (<) The Title   LIVE (a) (gear) │   │ (<) The Title   LIVE (o) (gear) │
│     subtitle                    │   │     subtitle                    │
│                                 │   │                                 │
│           (the film)            │   │     (<<)   ( > )   (>>)         │
│                                 │   │                                 │
│ 12:04 |====o----------- | 38:20 │   │ 12:04 |====o------------| 38:20 │
│       (<<)  ( > )  (>>)         │   │                      [Go live]  │
└─────────────────────────────────┘   └─────────────────────────────────┘
```

* **Top left — leave.** One button, in the corner every platform has trained
  people to look at, and nowhere near anything that changes playback.
* **Top right — what you set once.** Picture size, pop out, lock, settings, plus
  two readouts: the LIVE pill, and a speed chip that appears *only* when the rate
  is not 1×, because a chip permanently reading "1x" is a label for the absence
  of a setting. Icons rather than words: a cluster of small round shapes at the
  edge of the frame reads as chrome, where six words read as a sentence.
* **Bottom — the scrub bar** and its two readouts; on a TV, skip / play / skip
  beneath it as well.
* **Centre — the transport, on touch only** (`transportPlacement`). A thumb
  reaches the middle of a phone without the hand moving, it is where every phone
  video app has taught people to look, and it is the only place a control can go
  that adds nothing to the height of a strip of chrome — a bottom strip carrying
  the bar *and* a 60dp play button is 120dp, about a third of a handset in
  landscape. A TV keeps the bottom arrangement, because D-pad focus cannot reach
  the middle of the picture without stealing left/right from the scrub bar.

What else differs between the two is only what *exists*: lock and pop out are
touch-only, key hints and the scrims are TV-only, and on a screen narrower than
560dp the picture-size and pop-out shortcuts drop out of the cluster
(`showsOptionShortcuts`) because a back button plus four icons leaves a 390dp
phone no room for the title. Both of those are also in the settings panel, which
is what makes dropping them safe. Nothing is sized below `minTouchTarget` (48dp).

**Skip buttons are now on a phone too**, which reverses an earlier decision worth
naming. The argument against them was that double-tapping either side of the
screen already skips and a second route is clutter — true while they were
competing with five other buttons for one row. With the options moved up, the
transport row holds three controls and the standard skip/play/skip group fits
without crowding anything. More to the point, the gesture had been the *only* way
to skip on a phone, and it is the one gesture in the player a new user has no way
to discover.

### The scrim is two gradients on a TV, and nothing on a phone

The overlay used to sit on a single full-screen 55% black layer, so making the
text legible meant dimming the entire film — including the middle of the frame,
where there is never a control and always the thing being watched. Every four
seconds the whole picture got darker and then lighter again.

Controls only ever occupy the top and bottom strips, so that is where the scrim
is, and it fades to nothing before it reaches the middle. Each strip can then be
*darker* than 55% precisely because it is not covering anything worth seeing, so
the text is more legible than before rather than less. The heights are computed
from what each strip actually holds (`resolveScrimHeights`) rather than set as a
percentage of the screen, which is the shortcut that does not survive the aspect
ratios this app runs at: 40% of a phone in portrait is 340dp of gradient over
about 140dp of controls.

These are real gradients, not a stack of banded Views — React Native 0.87 draws
them natively through the `backgroundImage` style, which needs the New
Architecture this app already requires.

**A phone gets neither of them** (`showsScrims`), because it does not have the
room. Sizing each strip from what it holds is right, and on a handset what it
holds is most of the screen: in landscape the top bar, the bottom strip and their
two 48dp ramps came to roughly 310dp of a 390dp viewport, so the two gradients
met in the middle with no picture left between them and tapping to raise the
controls drew a curtain over the film. Moving the transport to the centre pays
part of that back, but not enough to be worth a band across the frame. So on
touch the chrome backs itself: every control is already a translucent pill or
disc with a hairline border, and the text that is not inside one — title,
subtitle, the two readouts, the live-stream hint — gets a text shadow, which
costs a couple of dp around each glyph rather than a third of the screen.

The overlay also fades in and out instead
of cutting, and only a phone gets the fade *out*: on a TV a control that is
fading is still a control the D-pad can reach and press, and it would be
competing for focus with the invisible layer that replaces it. See
`useOverlayFade.ts`.

### The icons are drawn from Views

There is no icon font and no SVG library, and the player is not a good enough
reason to add one — a font asset is a build-config change, a vector library is a
native dependency, and both would ship to a TV to draw a dozen shapes. Emoji are
out separately: Android renders those through the colour emoji font, so a play
button arrives as a full-colour pictogram at a size and weight nothing else on
screen shares.

That used to mean a map of geometric characters (U+25B6 for play, U+2699 for the
gear) and *words* for everything with no character to stand in — which is exactly
why picture size said "Fit" and the lock said "Lock". Roboto has no padlock, no
picture-in-picture mark and no aspect-ratio mark that is reliably present on
every Android build, and the failure mode is a tofu box. Characters also arrive
at whatever weight the font drew them, so a heavy U+25B6 next to a hairline
U+2699 never matched, and each one needs its own nudge to centre in a round
button.

`PlayerIcon.tsx` draws all thirteen from Views instead: the shape is the box, so
it centres by construction, the weight is one `stroke` value across the set, and
the colour and size are props rather than font metrics. `components/SearchIcon.tsx`
made the same trade earlier for the same reasons.

The settings panel changes shape rather than scaling — a column down the side
where there is width for one, a sheet up from the bottom below 560dp — and the
overlay's screen-edge padding is the one part of the layout that a cached
`makeStyles` sheet cannot hold, because safe-area insets are not part of
`Metrics` and move independently of the window size. That padding is applied per
zone rather than once to the root, because the scrims are absolutely positioned
children of that root and Yoga places an absolute child inside its parent's
padding — padding the root would inset the gradients from the screen edge.

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
* Tab rail: LEFT/RIGHT walks the tabs, OK opens one, DOWN enters its content and
  UP comes back to the tab you left — not to Home
* **HLS playback works** — Apple's BipBop reference stream and a 4K sample both
  decode through Media3, connecting directly to their CDNs
* Scheduled fixtures with no `stream_url` show `NOT STARTED` and do not open the
  player

**The player, on the TV emulator**
* Overlay auto-hides after 4s, and **OK brings it back** — see the key-action
  gotcha below for why that took a fix rather than working first time
* UP from the button row focuses the scrub bar (thicker track, visible thumb),
  and left/right then scrub instead of moving focus
* A three-press skip chain moves the position once, 0:28 → 0:58, with the
  buffering spinner appearing at the commit rather than at each press
* Live channel: LIVE pill, a `-6:15` behind-the-edge readout and a **Go live**
  button; VOD: elapsed/total (`0:25 / 10:34`), no LIVE pill, no Go live
* Settings panel opens as a side column, `1x` and `Fit` shown as the selected
  options, and the audio list is built from the real stream (`Auto`, `Track 1`)
* **Back closes the settings panel and stays in the player**; a second Back
  returns to Home with the row's focus preserved
* Picture-size cycling applies immediately, with its readout over the video
* Subtitles from the stream render (BipBop's "Bip!" caption)

**The rebuilt overlay, on the TV emulator**
* The three zones render as designed: back at the top left, the picture-size and
  settings icons at the top right, and skip / play / skip under the scrub bar
* All thirteen drawn icons render correctly at their button sizes — no tofu, no
  clipping, and the gear and the aspect brackets are legible at 22dp
* The accessibility tree names every control (`Leave the player`,
  `Picture size: Fit. Change it`, `Back 10 seconds`, `Seek bar, 4:02 of 12:14`),
  so the icon-only buttons still announce what they do and what state they are in
* D-pad UP walks transport → scrub bar → top cluster and back down; pressing OK
  on the picture-size icon cycles `Fit` → `Fill` and **keeps focus on the icon**
  rather than throwing it back to Play
* The gradient scrims render natively with no banding, and on a near-white title
  card the subtitle and the scrub bar stay legible — which took the `hold` fix
  in `resolveScrimHeights`, since a ramp that starts at the screen edge is
  already two-thirds gone by the time it reaches the subtitle
* **Paused, the overlay now stays up**: it used to vanish four seconds after any
  key press because `revealOverlay` re-armed the auto-hide timer regardless of
  playback state, and the effect that pins the controls up only re-runs when one
  of its dependencies changes

**Not verified on a device**
* Every touch gesture — double-tap skip, swipe-to-scrub, the volume and
  brightness swipes, press-and-hold speed, pinch, lock — and picture-in-picture.
  Only the Android TV system image is installed here, and a TV emulator is the
  wrong device to judge a thumb on. These need a phone AVD
  (`system-images;android-36;google_apis;x86_64`) or a real phone.

---

## Gotchas worth knowing

These cost real debugging time. They are documented so they do not cost it
twice.

**`aapt2` renames the `drawable-television` folder in the APK.** Verifying the
splash resources against a built APK shows the TV variant as
`res/drawable-television-v8/splash_screen.xml`, not `drawable-television`: the
tool appends the API level at which the qualifier was introduced. It is harmless
— any device that matches `television` is far past API 8 — but an exact-match
search for `drawable-television` in the APK will come up empty and look like the
resource never shipped. Confirm variants with `aapt2 dump resources <apk>` and
read the config labels it prints, which are the real qualifiers:

```
resource drawable/splash_screen
  ()           res/drawable/splash_screen.xml
  (television) res/drawable-television-v8/splash_screen.xml
  (v31)        res/drawable-v31/splash_screen.xml
```

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

**Only one half of a key press reaches JavaScript, and which half varies.** A
press produces ACTION_DOWN then ACTION_UP, so the obvious filter is "ignore the
UP" — and on this app that ignores *every* press. Verified on the TV emulator:
in the player, the only event that arrives is the UP, because the DOWN is
consumed on the way through the view tree by whatever holds focus. The player
therefore latches onto whichever action it sees first and ignores that action's
twin from then on, rather than hard-coding either answer. Symptom if you get it
wrong: the overlay auto-hides and no key on the remote can bring it back.

**`BackHandler` does not fire under the native stack on Android.**
react-native-screens pops the route natively, so a hardware Back press never
reaches a JavaScript handler — verified by pressing Back with the player's
settings panel open and landing back on Home. Anything that needs to absorb Back
must go through the navigator instead: `PlayerScreen` uses `usePreventRemove`,
and the player exposes `dismissTop()` for it to call. The `BackHandler`
registration is kept only for hosts that are not native-stack routes.

**`nativeEvent.locationX` is relative to the view the touch HIT, not to the
responder.** A drag handler on a container therefore gets coordinates measured
against whichever child happened to be under the finger. The scrub bar has four
children — track, buffered fill, played fill, thumb — so grabbing the thumb, which
is exactly what a hand aims at, reported an x between 0 and 16 instead of a
position along the bar; mapped to a time, that is the start of the film. The
symptom is a bar that flickers and jumps to the beginning while being dragged.
Use screen coordinates instead (`pageX` on grant, `gestureState.moveX` while
moving) against the track's own measured `pageX` from `measure()`, and set
`pointerEvents="none"` on the decorative children so the row is the only thing a
touch can land on.

**`Pressable` overrides pan handlers spread onto it.** It renders
`<View {...restPropsWithDefaults} {...eventHandlers}>` — its own responder
handlers come *last*, so `{...panResponder.panHandlers}` passed to a `Pressable`
is silently replaced. The symptom is a control that reports taps and never
reports a drag, which reads as a broken gesture rather than as the wrong
component. `SeekBar` therefore uses a plain `View` for the touch path and a
`Pressable` only for the TV path, and says so in a comment.

**An ordinary `View` swallows a touch it does not handle.** It does not fall
through to a sibling behind it just because it has no touch handler — hit testing
stops at the deepest view, and if neither it nor its ancestors claim the
responder the touch is simply dropped. This is why every container in the
player's overlay carries `pointerEvents="box-none"`: without it the overlay would
cover the gesture layer beneath it and a swipe over the controls would do
nothing.

**Fast Refresh cannot survive a changed hook order.** Adding a `useState` in the
middle of a component that is already mounted produces a black screen and:

```
React has detected a change in the order of Hooks called by <Component>
Error: Should have a queue. You are likely calling Hooks conditionally
```

This is not a bug in your code. Force-stop and relaunch the app:
`adb shell am force-stop com.vistora`.

**The TV emulator dies on its own, repeatedly.** Three times in one session here,
under both `-gpu host` and `-gpu swiftshader_indirect` — twice with video playing
and once while nothing but `screencap` was running against it — the emulator
process exited with a flood of

```
ERROR | Failed to find ColorBuffer: 403
[h264 @ 0x...] no frame!
```

The app is not crashing — the emulator's own graphics/codec bridge is, and it
takes the device with it (`adb devices` goes empty, sometimes via `device
offline`). So plan player testing in short sessions, and re-check `adb devices`
before concluding that a key press did nothing. A real TV does not do this.

It is also the leading explanation for a one-off SIGSEGV seen on the Home screen
in `MountingCoordinator::pullTransaction` ("trying to execute non-executable
memory"), which did not reproduce in four clean targeted cold starts. If that
signature ever appears on real hardware, it is worth taking seriously; on this
emulator it is not evidence of much.

**`adb screencap` cannot always capture video.** The player renders into a
`SurfaceView`, which may come back as pure black in a screenshot even while video
is visibly playing. Do not conclude playback is broken from a black screenshot —
check `logcat` for `ExoPlayerImpl` and `BufferPoolAccessor` activity instead.

## Deliberately not built yet

Auth, user profiles, favourites, watch history / continue watching, EPG,
notifications, parental controls, subscriptions, and the admin dashboard.

Search is built, but only as substring matching (see [Search](#search)); it does
not rank results, tolerate a typo, or search across kinds in one merged list.

The schema is shaped to absorb them: every content table already carries `slug`,
`is_active`, `sort_order` and timestamps, so a new content type is a copy of a
known pattern — including its RLS policies — rather than a new invention.
