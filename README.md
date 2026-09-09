# Vistora

An app for personal content consumption — live TV, sport, movies and cartoons —
built with React Native, TypeScript and Supabase. It runs on **Android TV** with
a remote and on **Android phones and tablets** with a finger, from one codebase
and one APK.

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
| `drawable-*/splash_logo.png` | Native cold-start splash, via `SplashTheme` |
| `src/assets/logo{,@2x,@3x}.png` | `SplashOverlay`, the JS half of the splash |

Three things about this worth knowing before you change any of it:

- **The launcher icon carries the V mark alone.** At 48dp the wordmark is a
  smudge. The script finds the mark by projecting the artwork's non-backdrop
  pixels onto the vertical axis and taking the topmost band of rows; run with
  `--debug` to see the boxes it picked, and `--crop L,T,R,B` to override them.
- **The source's navy backdrop is knocked out to transparency.** An adaptive
  icon's foreground layer *must* be transparent, because the launcher masks it
  into a circle or squircle and composites it over the background layer itself.
- **The splash has two halves and needs both.** `SplashTheme`'s window
  background covers tap → React's first paint, because that is the only thing
  Android can draw before our code runs; `SplashOverlay` covers React's first
  paint → a UI worth looking at. Both draw the same lock-up at the same size on
  the same colour, so the handoff is invisible. Change one size and you must
  change the other — `SPLASH_LOGO_DP` in the script, `LOGO_BOX` in the
  component.

---

## Project structure

```
src/
  config/env.ts          the only file that reads @env
  lib/supabase.ts        the Supabase client; nothing else creates one
  services/              every database read, and the app's error type
  types/                 database rows, app models + mappers, route params
  hooks/                 useAsyncData (loading / error / retry)
  theme/                 colours, type scale, and the responsive metrics system
  components/            Focusable, ContentCard, ContentRow, state views, SplashOverlay
  assets/                generated logo rasters for the splash (see Branding assets)
  player/                the player: overlay, gestures, remote, settings panel
                         — and it knows nothing about Supabase
  screens/               Home, LiveTv, Player
  navigation/            native stack
supabase/
  migrations/            schema, RLS, indexes
  seed.sql               sample data with public test streams
scripts/
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
selection disappears off-screen. `LiveTvScreen` measures its grid and divides the
space, so the row always fills exactly and no column can be cut off.

---

---

## Responsive layout: one codebase, two devices

One APK has to be a 10-foot UI on a television and an ordinary touch app on a
phone. Those are not the same layout with different padding — a 216dp sidebar is
a quarter of a TV screen and more than half a phone screen — so the difference is
resolved in exactly one place and read everywhere else.

### Orientation is set in `MainActivity`, not the manifest

`android:screenOrientation` is a single static manifest attribute. It takes no
resource qualifier, and the same APK installs on both devices, so it cannot
express two answers. The manifest therefore declares nothing and
`MainActivity.onCreate` sets `requestedOrientation`:

| Device | Policy | Why |
|---|---|---|
| TV | `SCREEN_ORIENTATION_LANDSCAPE` | A television is landscape and nothing else. Pinning it means no stray sensor reading or `adb shell` rotation can hand a 10-foot UI a portrait window. |
| Phone / tablet | `SCREEN_ORIENTATION_USER` | Portrait in an upright hand, landscape when turned — and it honours the rotation lock in quick settings. `FULL_SENSOR` would override that lock, which is not ours to override. |

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
| Live TV grid | 4 columns | 2 columns | 3 columns |
| Category picker | sidebar | chip rail | sidebar |
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

### The one screen that changes shape

`LiveTvScreen` swaps its category sidebar for a horizontal chip rail below 700dp
of content width. Note the test is on available *width*, not on device class: a
phone in landscape has ~796dp and keeps the sidebar, which is right, because
vertical space is what that window is short of and a sidebar costs none of it.

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
  PlayerControls.tsx     the overlay, in both shapes
  SeekBar.tsx            draggable on touch, focusable on TV
  SettingsPanel.tsx      speed, picture size, audio, subtitles
  GestureFeedback.tsx    the readouts a gesture needs and a button does not
  ControlButton.tsx      focus (TV) and press (touch) in one control
  playbackOptions.ts     rates, scaling modes, track labels, clamping — pure
  playerLayout.ts        control sizes per device, and the screen-edge padding
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

### Controls on a TV, controls on a phone

Same pieces, different arrangement, resolved in `playerLayout.ts`:

* **TV** — two focus rows and nothing else: the scrub bar, then one row of
  buttons. No centre cluster, because a remote cannot reach for the middle of the
  screen and a second focus target there would only compete for left/right. Key
  hints are printed, because nothing on a remote is self-evident.
* **Touch** — a big play/skip cluster in the centre, where the thumb already is,
  and small secondary controls at the bottom. Nothing is sized below
  `minTouchTarget` (48dp). The centre cluster duplicates the gestures on purpose:
  double-tap-to-skip is faster once you know it, and invisible until someone
  tells you.

The settings panel changes shape rather than scaling — a column down the side
where there is width for one, a sheet up from the bottom below 560dp — and the
overlay's screen-edge padding is the one part of the layout that a cached
`makeStyles` sheet cannot hold, because safe-area insets are not part of
`Metrics` and move independently of the window size.

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

These cost real debugging time. They are documented so they do not cost it
twice.

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
