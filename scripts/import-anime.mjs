#!/usr/bin/env node
// @ts-check
/**
 * Imports anime SERIES, with their episodes, from official YouTube channels
 * into a SQL seed file for `public.series` and `public.episodes`.
 *
 * ---------------------------------------------------------------------------
 * Why YouTube, when everything else in this project is a direct stream
 * ---------------------------------------------------------------------------
 * Because for anime there is no other legal answer, and it is worth being
 * precise about why rather than discovering it halfway through an import.
 *
 * `import-archive.mjs --kind=anime` exists and works, but its own header
 * explains that the corpus is nearly empty: only pre-1953 Japanese animation
 * has lapsed into the public domain, and almost none of it is uploaded with the
 * explicit license metadata that script requires. Expect single digits, and no
 * series at all.
 *
 * Everything made since is exclusively licensed, and no licensee publishes a
 * stream URL. What several of them DO publish is a YouTube channel carrying
 * full episodes, free, with subtitles: Muse Asia and Ani-One Asia between them
 * license most of what is currently airing for South and Southeast Asia --
 * which includes Bangladesh, the country this project's IPTV importer already
 * defaults to. That is a real catalogue of real series with real episode lists,
 * and it is offered by the rights holders themselves.
 *
 * The alternative -- the sites that genuinely do have "any anime" -- are
 * unlicensed restreams. They would break the same rule the iptv-org blocklist
 * and the archive.org license filter exist to enforce, they rot constantly, and
 * they are the one thing that gets an app removed rather than merely broken.
 *
 * ---------------------------------------------------------------------------
 * What this writes, and how it is played
 * ---------------------------------------------------------------------------
 * Episodes are stored with `stream_protocol = 'youtube'` and a watch URL. The
 * app does NOT decode those: it opens them in the YouTube app, so the rights
 * holder receives the view and the advertising revenue that is paying for the
 * episode to be free. See supabase/migrations/0004_add_youtube_protocol.sql and
 * src/services/externalPlayback.ts. Extracting the underlying media instead
 * would be a Terms of Service violation and a player that breaks every few
 * weeks; this script will not do it and the app has no code that could.
 *
 * ---------------------------------------------------------------------------
 * Setup
 * ---------------------------------------------------------------------------
 * Needs a YouTube Data API v3 key, which is free:
 *
 *   1. https://console.cloud.google.com/ -> create (or pick) a project
 *   2. APIs & Services -> Library -> enable "YouTube Data API v3"
 *   3. APIs & Services -> Credentials -> Create credentials -> API key
 *   4. export YOUTUBE_API_KEY=...        (or put it in .env; see below)
 *
 * The free quota is 10,000 units a day and a full run of this script costs
 * roughly one unit per API call -- a few hundred for twenty series. You will
 * not come close.
 *
 * NOTE on .env: this key is read by NODE, at import time, not by the app. It is
 * deliberately NOT wired through babel/react-native-dotenv, because anything
 * that reaches `@env` is inlined into the shipped bundle where anyone can read
 * it. Keep it in your shell, or in .env read by this script only.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   npm run import:anime                             # default channels
 *   node scripts/import-anime.mjs --channels=@MuseAsia
 *   node scripts/import-anime.mjs --limit=40
 *   node scripts/import-anime.mjs --min-episodes=8
 *   node scripts/import-anime.mjs --region=BD        # skip series blocked there
 *   node scripts/import-anime.mjs --no-anilist       # skip artwork enrichment
 *   node scripts/import-anime.mjs --out=supabase/seed_anime_series.sql
 *
 * Apply the MIGRATIONS FIRST -- 0004 adds the 'youtube' protocol value and 0005
 * creates the two tables, and PostgreSQL will not let a new enum value be used
 * in the transaction that adds it, so they cannot be part of the seed:
 *
 *   psql "$DATABASE_URL" -f supabase/migrations/0004_add_youtube_protocol.sql
 *   psql "$DATABASE_URL" -f supabase/migrations/0005_series_and_episodes.sql
 *   psql "$DATABASE_URL" -f supabase/seed_anime_series.sql
 */

import { writeFile } from 'node:fs/promises';

import {
  cleanSeriesTitle,
  isNonEpisodeTitle,
  parseEpisodeNumber,
  parseIsoDuration,
  parseSeasonNumber,
} from './animeTitles.mjs';

const YOUTUBE = 'https://www.googleapis.com/youtube/v3';
const ANILIST = 'https://graphql.anilist.co';
const WATCH = 'https://www.youtube.com/watch';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const argv = new Map(
  process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const list = (key, fallback) => {
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

const number = (key, fallback) => {
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number, got "${raw}"`);
  return parsed;
};

/**
 * Channels whose uploads are published by the licence holder.
 *
 * Handles rather than `UC...` ids, deliberately. A handle is something you can
 * read, type into a browser and verify in five seconds; a channel id is 24
 * opaque characters that nobody can check by eye, and a wrong one fails as an
 * empty result rather than as an error. The script resolves handles through the
 * API and SKIPS any that do not resolve, with a message -- so a renamed channel
 * costs you that channel, not the run.
 *
 * Treat this list as a starting point and verify it against what is actually
 * licensed in YOUR region before shipping: these channels region-lock per
 * title, and `--region` below is how you check. Add your own with --channels.
 */
const DEFAULT_CHANNELS = ['@MuseAsia', '@Ani-One', '@AnimeLogTV'];

const options = {
  apiKey: process.env.YOUTUBE_API_KEY ?? '',
  channels: list('channels', DEFAULT_CHANNELS),
  /** Maximum SERIES to import. Episodes are unbounded within a series. */
  limit: number('limit', 20),
  /**
   * A playlist with fewer than this is not a series: official channels use
   * playlists for trailer reels and seasonal promos too, and those are the ones
   * with two or three items in them.
   */
  minEpisodes: number('min-episodes', 4),
  /**
   * And a playlist with more than this is a channel-wide "all uploads" dump
   * rather than one show -- importing it produces a single 900-episode "series"
   * containing everything the channel has ever posted.
   */
  maxEpisodes: number('max-episodes', 400),
  /** ISO 3166-1 country to check region blocks against, or '' to skip. */
  region: (argv.get('region') ?? '').toUpperCase(),
  anilist: argv.get('no-anilist') !== 'true',
  timeoutMs: number('timeout', 20_000),
  out: argv.get('out') ?? 'supabase/seed_anime_series.sql',
};

if (!options.apiKey) {
  console.error(
    'YOUTUBE_API_KEY is not set.\n\n' +
      'This script needs a free YouTube Data API v3 key. See the header of\n' +
      'scripts/import-anime.mjs for the four steps, then:\n\n' +
      '  export YOUTUBE_API_KEY=...\n' +
      '  npm run import:anime\n',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AniList genre -> Vistora category
// ---------------------------------------------------------------------------
// `series.category_id` holds exactly one category and AniList returns a list of
// genres, so the FIRST match in this order wins.
//
// The sort values start at 50 on purpose. import-archive.mjs --kind=anime
// writes categories at 10..40 ('anime-classic', 'anime-shorts', 'anime-series',
// 'anime-films') and both scripts `on conflict (slug) do update` the sort
// order, so overlapping numbers would make the category rail reshuffle
// depending on which importer ran last.
//
// The fallback deliberately REUSES 'anime-series' at the archive script's own
// sort value, for the same reason: two importers, one row, one answer.

const CATEGORIES = [
  {slug: 'anime-action', name: 'Action', kind: 'anime', sort: 50, match: ['action', 'adventure', 'sports']},
  {slug: 'anime-fantasy', name: 'Fantasy & Sci-Fi', kind: 'anime', sort: 60, match: ['fantasy', 'sci-fi', 'supernatural', 'mecha', 'horror']},
  {slug: 'anime-comedy', name: 'Comedy', kind: 'anime', sort: 70, match: ['comedy', 'slice of life']},
  {slug: 'anime-drama', name: 'Drama & Romance', kind: 'anime', sort: 80, match: ['drama', 'romance', 'psychological', 'mystery']},
  {slug: 'anime-series', name: 'Series', kind: 'anime', sort: 30, match: []}, // fallback
];

function categoryFor(genres) {
  const haystack = genres.map(g => String(g).toLowerCase());
  for (const rule of CATEGORIES) {
    if (rule.match.some(m => haystack.includes(m))) return rule;
  }
  return CATEGORIES.at(-1);
}

/**
 * The same title filter import-archive.mjs applies, and always on for the same
 * reason. AniList's `isAdult` flag covers the licensed catalogue properly, but
 * this also runs on series that AniList could not match, where there is no flag
 * to consult.
 */
const UNSUITABLE_PATTERN =
  /\b(sex|sexy|nude|naked|porn|porno|erotic|erotica|xxx|hentai|ecchi|striptease|smut)\b/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Must satisfy the `public.slug` domain: ^[a-z0-9]+(?:-[a-z0-9]+)*$, 2..80. */
function toSlug(text, maxLength = 80) {
  const base = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : null;
}

/**
 * `${seriesSlug}-s1e7`, trimmed so the result still fits the 80-character slug
 * domain.
 *
 * The series part is truncated rather than the suffix, because the suffix is
 * what makes the slug unique within the series -- shortening THAT is how you
 * get two episodes with one slug and a constraint violation partway through
 * applying the seed file.
 */
function episodeSlug(seriesSlug, season, episodeNumber) {
  const suffix = `-s${season}e${episodeNumber}`;
  return `${seriesSlug.slice(0, 80 - suffix.length).replace(/-+$/g, '')}${suffix}`;
}

const sqlText = value =>
  value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`;

const sqlNumber = value =>
  value === null || value === undefined || !Number.isFinite(value) ? 'null' : String(Math.round(value));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // A 403 here is nearly always the key, and the API's own message says
      // "quotaExceeded" or "accessNotConfigured" -- worth surfacing verbatim
      // rather than flattening to "HTTP 403".
      throw new Error(`HTTP ${response.status} for ${url.split('?')[0]}: ${body.slice(0, 300)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One YouTube Data API call. Pages are the caller's problem. */
function youtube(resource, params) {
  const url = new URL(`${YOUTUBE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('key', options.apiKey);
  return getJson(url.toString());
}

/** Follows `nextPageToken` until the API stops offering one. */
async function youtubeAll(resource, params, pageLimit = 20) {
  const items = [];
  let pageToken;
  for (let page = 0; page < pageLimit; page++) {
    const body = await youtube(resource, {...params, maxResults: 50, pageToken});
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/**
 * Turns '@MuseAsia' or a raw 'UC...' id into a channel id.
 *
 * Returns null rather than throwing when a handle does not resolve. A channel
 * that has been renamed should cost you that channel and a warning, not the
 * whole run and whatever the previous channels had already collected.
 */
async function resolveChannelId(handleOrId) {
  if (/^UC[\w-]{20,}$/.test(handleOrId)) {
    return handleOrId;
  }

  const handle = handleOrId.startsWith('@') ? handleOrId : `@${handleOrId}`;
  try {
    const body = await youtube('channels', {part: 'id', forHandle: handle});
    const id = body.items?.[0]?.id ?? null;
    if (!id) {
      console.warn(
        `  ! ${handle} did not resolve to a channel -- skipping.\n` +
          '    Open https://www.youtube.com/' + handle + ' to check the handle,\n' +
          "    or pass the UC... id directly with --channels.",
      );
    }
    return id;
  } catch (error) {
    console.warn(`  ! ${handle} lookup failed (${error.message}) -- skipping.`);
    return null;
  }
}

/**
 * A channel's playlists, which is where the series live.
 *
 * Playlists rather than the uploads feed, because the uploads feed is one flat
 * chronological list of every episode of every show the channel carries,
 * interleaved. Reconstructing series boundaries from that means guessing from
 * titles; the playlists are the channel telling us where the boundaries are.
 */
async function fetchSeriesPlaylists(channelId) {
  const playlists = await youtubeAll('playlists', {
    part: 'snippet,contentDetails',
    channelId,
  });

  return playlists.filter(playlist => {
    const count = playlist.contentDetails?.itemCount ?? 0;
    const title = playlist.snippet?.title ?? '';
    return (
      count >= options.minEpisodes &&
      count <= options.maxEpisodes &&
      !isNonEpisodeTitle(title) &&
      !UNSUITABLE_PATTERN.test(title)
    );
  });
}

/** Every video in a playlist, in playlist order. */
async function fetchPlaylistVideos(playlistId) {
  const items = await youtubeAll('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId,
  });

  return items
    .map(item => ({
      videoId: item.contentDetails?.videoId ?? null,
      title: (item.snippet?.title ?? '').trim(),
      description: (item.snippet?.description ?? '').trim(),
      // `videoPublishedAt` is when the EPISODE went up; `publishedAt` on the
      // snippet is when it was added to this playlist, which for a back
      // catalogue is the day someone built the playlist and is useless.
      publishedAt: item.contentDetails?.videoPublishedAt ?? null,
      thumbnail: pickThumbnail(item.snippet?.thumbnails),
      position: item.snippet?.position ?? 0,
    }))
    // A private or deleted video keeps its slot in the playlist and its
    // snippet is replaced with a stub. Importing one gives a card that opens
    // an error page.
    .filter(
      video =>
        video.videoId &&
        video.title &&
        !/^(private|deleted) video$/i.test(video.title),
    );
}

/** Highest-resolution thumbnail the API offered. */
function pickThumbnail(thumbnails) {
  if (!thumbnails) return null;
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbnails[size]?.url;
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return null;
}

/**
 * Duration and availability for up to 50 videos per call.
 *
 * Needed for `duration_seconds`, and it is also the only place a REGION BLOCK
 * is visible: a video blocked in your country is returned by playlistItems
 * exactly like any other and only `contentDetails.regionRestriction` says
 * otherwise. Importing those gives a catalogue that looks complete and is full
 * of episodes that show "not available in your country" on the television.
 */
async function fetchVideoDetails(videoIds) {
  const details = new Map();

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const body = await youtube('videos', {
      part: 'contentDetails,status',
      id: batch.join(','),
    });

    for (const item of body.items ?? []) {
      const restriction = item.contentDetails?.regionRestriction;
      details.set(item.id, {
        durationSeconds: parseIsoDuration(item.contentDetails?.duration),
        isPublic: item.status?.privacyStatus === 'public',
        blockedHere: isBlockedIn(restriction, options.region),
      });
    }
  }

  return details;
}

/** True when `regionRestriction` excludes `region`. False when unknown. */
function isBlockedIn(restriction, region) {
  if (!region || !restriction) return false;
  if (Array.isArray(restriction.blocked) && restriction.blocked.includes(region)) {
    return true;
  }
  // `allowed` is the inverse form: present means "ONLY these countries".
  if (Array.isArray(restriction.allowed) && restriction.allowed.length > 0) {
    return !restriction.allowed.includes(region);
  }
  return false;
}

// ---------------------------------------------------------------------------
// AniList
// ---------------------------------------------------------------------------

const ANILIST_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    title { romaji english }
    description(asHtml: false)
    seasonYear
    startDate { year }
    genres
    isAdult
    coverImage { extraLarge large }
    bannerImage
  }
}`;

/**
 * Artwork and a synopsis for a series, from AniList.
 *
 * Worth a second API entirely, because YouTube gives a playlist exactly one
 * piece of artwork -- the thumbnail of its first video, a 16:9 frame. The
 * Anime grid renders 2:3 posters, so without this every card in it is a
 * letterboxed still with bars down both sides. AniList publishes the actual
 * key art.
 *
 * Free, no key, no account. Returns null on any failure, including no match:
 * a series with a YouTube thumbnail and no synopsis is still a working series,
 * and losing the whole import because a fan database was down for a minute
 * would be absurd.
 */
async function fetchAniList(title) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(ANILIST, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'application/json'},
      body: JSON.stringify({query: ANILIST_QUERY, variables: {search: title}}),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.data?.Media ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`resolving ${options.channels.length} channel(s)...`);

const channelIds = [];
for (const handle of options.channels) {
  const id = await resolveChannelId(handle);
  if (id) {
    channelIds.push({handle, id});
    console.log(`  ${handle} -> ${id}`);
  }
}

if (!channelIds.length) {
  console.error('\nNo channels resolved -- nothing to import.');
  process.exit(1);
}

/** @type {Array<{channel: string, playlist: any}>} */
const candidates = [];
for (const {handle, id} of channelIds) {
  const playlists = await fetchSeriesPlaylists(id);
  console.log(`  ${handle}: ${playlists.length} playlist(s) look like a series`);
  for (const playlist of playlists) {
    candidates.push({channel: handle, playlist});
  }
}

// Longest first: a channel's flagship show has the most episodes, and a small
// --limit should return those rather than an arbitrary slice.
candidates.sort(
  (a, b) =>
    (b.playlist.contentDetails?.itemCount ?? 0) -
    (a.playlist.contentDetails?.itemCount ?? 0),
);

const seriesRows = [];
const episodeRows = [];
const seenSlugs = new Set();
const seenTitles = new Set();

for (const {channel, playlist} of candidates) {
  if (seriesRows.length >= options.limit) break;

  const rawTitle = String(playlist.snippet?.title ?? '').trim();
  const searchTitle = cleanSeriesTitle(rawTitle) || rawTitle;

  // One card per show, even when two channels carry it.
  const titleKey = searchTitle.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!titleKey || seenTitles.has(titleKey)) continue;

  const videos = await fetchPlaylistVideos(playlist.id);
  if (videos.length < options.minEpisodes) continue;

  const details = await fetchVideoDetails(videos.map(v => v.videoId));

  const meta = options.anilist ? await fetchAniList(searchTitle) : null;
  if (options.anilist) {
    // AniList asks for ~90 requests a minute and this is a build script with
    // nowhere to be. A flat pause is simpler than a token bucket and is the
    // difference between finishing and being rate-limited halfway.
    await sleep(700);
  }

  if (meta?.isAdult) {
    console.log(`  - skipping "${searchTitle}" (AniList marks it adult)`);
    continue;
  }
  if (UNSUITABLE_PATTERN.test(rawTitle) || UNSUITABLE_PATTERN.test(searchTitle)) {
    continue;
  }

  const title = meta?.title?.english || meta?.title?.romaji || searchTitle;
  const slug = toSlug(`${title}`);
  if (!slug || seenSlugs.has(slug)) continue;

  // Build the episode list before committing the series, so a playlist that
  // turns out to contain nothing importable does not leave an empty series
  // behind -- which would render as a card that opens an empty list.
  const episodes = [];
  const usedSlots = new Set();
  let fallbackNumber = 0;

  for (const video of videos) {
    const detail = details.get(video.videoId);
    if (detail && !detail.isPublic) continue;
    if (detail?.blockedHere) continue;
    if (isNonEpisodeTitle(video.title)) continue;

    const season = parseSeasonNumber(video.title);
    const parsed = parseEpisodeNumber(video.title);

    // Position in the playlist is the fallback, and it is a genuinely good one:
    // official channels keep their playlists in running order. It is a fallback
    // anyway because it silently renumbers everything after any gap, and a
    // title that states its number is the channel telling us directly.
    fallbackNumber += 1;
    const episodeNumber = parsed ?? fallbackNumber;

    const slot = `${season}:${episodeNumber}`;
    if (usedSlots.has(slot)) {
      // `episodes_slot_key` would reject this when the seed is applied, partway
      // through, naming neither video. Dropping it here with a message is the
      // same outcome, visible at the moment it is decidable.
      console.log(
        `  ! "${title}" S${season}E${episodeNumber} claimed twice -- keeping the first, dropping ${JSON.stringify(video.title)}`,
      );
      continue;
    }
    usedSlots.add(slot);

    episodes.push({
      slug: episodeSlug(slug, season, episodeNumber),
      title: video.title.slice(0, 200),
      description: video.description.replace(/\s+/g, ' ').trim().slice(0, 1000) || null,
      thumbnailUrl: video.thumbnail,
      streamUrl: `${WATCH}?v=${encodeURIComponent(video.videoId)}`,
      season,
      episodeNumber,
      durationSeconds: detail?.durationSeconds ?? null,
      airDate: video.publishedAt ? video.publishedAt.slice(0, 10) : null,
    });
  }

  if (episodes.length < options.minEpisodes) {
    continue;
  }

  seenSlugs.add(slug);
  seenTitles.add(titleKey);

  const description =
    (meta?.description ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000) || null;

  seriesRows.push({
    slug,
    title: title.slice(0, 200),
    description,
    posterUrl: meta?.coverImage?.extraLarge ?? meta?.coverImage?.large ?? null,
    backdropUrl: meta?.bannerImage ?? episodes[0]?.thumbnailUrl ?? null,
    releaseYear: meta?.seasonYear ?? meta?.startDate?.year ?? null,
    category: categoryFor(meta?.genres ?? []),
    sourceId: playlist.id,
    channel,
  });

  episodeRows.push(...episodes.map(episode => ({...episode, seriesSlug: slug})));

  console.log(
    `  + ${title} -- ${episodes.length} episode(s) [${channel}]${meta ? '' : ' (no AniList match)'}`,
  );
}

if (!seriesRows.length) {
  console.error(
    '\nnothing to import -- refusing to write an empty seed file.\n\n' +
      'Things worth trying, in order:\n' +
      '  * --min-episodes=2, in case the channels carry short runs\n' +
      '  * --channels=@SomeOtherChannel for a licensor in your region\n' +
      '  * drop --region, which skips anything region-blocked where you are\n',
  );
  process.exit(1);
}

const usedCategories = CATEGORIES.filter(rule =>
  seriesRows.some(row => row.category.slug === rule.slug),
);

const sql = `-- Generated by scripts/import-anime.mjs on ${new Date().toISOString().slice(0, 10)}
-- Source: official YouTube channels (${[...new Set(seriesRows.map(r => r.channel))].join(', ')})
-- Metadata: https://anilist.co${options.region ? `\n-- Region-checked against: ${options.region}` : ''}
--
-- Every episode below is an official upload by the licence holder, stored as a
-- watch URL with stream_protocol = 'youtube'. The app opens those in the
-- YouTube app rather than decoding them, so the rights holder receives the view
-- and the advertising revenue. See src/services/externalPlayback.ts.
--
-- APPLY THE MIGRATIONS FIRST. This file uses the 'youtube' enum value and the
-- series/episodes tables, and PostgreSQL will not let an enum value be used in
-- the transaction that adds it:
--
--   psql "$DATABASE_URL" -f supabase/migrations/0004_add_youtube_protocol.sql
--   psql "$DATABASE_URL" -f supabase/migrations/0005_series_and_episodes.sql
--
-- series.episode_count is NOT set here: a trigger maintains it from the rows in
-- public.episodes, so writing it by hand would only be a chance to be wrong.

begin;

insert into public.categories (slug, name, kind, sort_order) values
${usedCategories
  .map(c => `  (${sqlText(c.slug)}, ${sqlText(c.name)}, '${c.kind}', ${c.sort})`)
  .join(',\n')}
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      sort_order = excluded.sort_order;

insert into public.series
  (slug, title, description, poster_url, backdrop_url, release_year,
   source, source_id, category_id, sort_order)
values
${seriesRows
  .map(
    (r, i) =>
      `  -- ${r.channel} / ${r.sourceId}\n` +
      `  (${sqlText(r.slug)}, ${sqlText(r.title)}, ${sqlText(r.description)},\n` +
      `   ${sqlText(r.posterUrl)}, ${sqlText(r.backdropUrl)}, ${sqlNumber(r.releaseYear)},\n` +
      `   'youtube', ${sqlText(r.sourceId)},\n` +
      `   (select id from public.categories where slug = ${sqlText(r.category.slug)}), ${(i + 1) * 10})`,
  )
  .join(',\n')}
on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      poster_url = excluded.poster_url,
      backdrop_url = excluded.backdrop_url,
      release_year = excluded.release_year,
      source = excluded.source,
      source_id = excluded.source_id,
      category_id = excluded.category_id,
      sort_order = excluded.sort_order,
      is_active = true;

insert into public.episodes
  (series_id, slug, title, description, thumbnail_url, stream_url,
   stream_protocol, season, episode_number, duration_seconds, air_date)
values
${episodeRows
  .map(
    r =>
      `  ((select id from public.series where slug = ${sqlText(r.seriesSlug)}),\n` +
      `   ${sqlText(r.slug)}, ${sqlText(r.title)}, ${sqlText(r.description)},\n` +
      `   ${sqlText(r.thumbnailUrl)}, ${sqlText(r.streamUrl)}, 'youtube',\n` +
      `   ${r.season}, ${r.episodeNumber}, ${sqlNumber(r.durationSeconds)}, ${sqlText(r.airDate)})`,
  )
  .join(',\n')}
on conflict (slug) do update
  set series_id = excluded.series_id,
      title = excluded.title,
      description = excluded.description,
      thumbnail_url = excluded.thumbnail_url,
      stream_url = excluded.stream_url,
      stream_protocol = excluded.stream_protocol,
      season = excluded.season,
      episode_number = excluded.episode_number,
      duration_seconds = excluded.duration_seconds,
      air_date = excluded.air_date,
      is_active = true;

commit;
`;

await writeFile(options.out, sql, 'utf8');

console.log(`\nwrote ${options.out}`);
console.log(
  `  ${seriesRows.length} series, ${episodeRows.length} episodes, ${usedCategories.length} categories`,
);
console.log(`\nreview it, then:  psql "$DATABASE_URL" -f ${options.out}`);
