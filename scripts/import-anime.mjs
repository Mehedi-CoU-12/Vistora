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
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};

const number = (key, fallback) => {
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed))
    throw new Error(`--${key} must be a number, got "${raw}"`);
  return parsed;
};

// Official licensor channels that publish FULL episodes, not just trailers.
// Every handle here was resolved against youtube.com before being added --
// `@Ani-One` and `@AnimeLogTV`, which used to be in this list, are both 404
// now (AnimeLog shut its channel down, Ani-One renamed to @AniOneAsia), and a
// dead handle is silent: resolveChannelId warns and skips, so the run simply
// imported less and said nothing about why.
//
// Ordered by how much currently-airing, English-subtitled catalogue each one
// carries, because `--limit` counts SERIES and trims from the tail.
//
// Quota: a channel costs one playlists call plus one playlistItems call per
// playlist, so six channels is a few thousand units of the 10,000/day a free
// key gets. Pass --channels to narrow it if you are sharing a key.
const DEFAULT_CHANNELS = [
  '@MuseAsia', //              Muse Communication, licensed for South/SE Asia
  '@AniOneAsia', //            Medialink's Ani-One Asia
  '@MuseIndonesia', //         Muse again, a different regional catalogue
  '@GundamInfo', //            Sunrise -- the Gundam TV series, free and whole
  '@TOEIAnimationOfficial', // Toei
  '@YuGiOh', //                Konami, full Yu-Gi-Oh! runs
];

const options = {
  apiKey: process.env.YOUTUBE_API_KEY ?? '',
  channels: list('channels', DEFAULT_CHANNELS),
  /** Maximum SERIES to import. Episodes are unbounded within a series. */
  limit: number('limit', 20),
  minEpisodes: number('min-episodes', 4),
  maxEpisodes: number('max-episodes', 400),
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

const CATEGORIES = [
  {
    slug: 'anime-action',
    name: 'Action',
    kind: 'anime',
    sort: 50,
    match: ['action', 'adventure', 'sports'],
  },
  {
    slug: 'anime-fantasy',
    name: 'Fantasy & Sci-Fi',
    kind: 'anime',
    sort: 60,
    match: ['fantasy', 'sci-fi', 'supernatural', 'mecha', 'horror'],
  },
  {
    slug: 'anime-comedy',
    name: 'Comedy',
    kind: 'anime',
    sort: 70,
    match: ['comedy', 'slice of life'],
  },
  {
    slug: 'anime-drama',
    name: 'Drama & Romance',
    kind: 'anime',
    sort: 80,
    match: ['drama', 'romance', 'psychological', 'mystery'],
  },
  { slug: 'anime-series', name: 'Series', kind: 'anime', sort: 30, match: [] }, // fallback
];

function categoryFor(genres) {
  const haystack = genres.map(g => String(g).toLowerCase());
  for (const rule of CATEGORIES) {
    if (rule.match.some(m => haystack.includes(m))) return rule;
  }
  return CATEGORIES.at(-1);
}

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

function episodeSlug(seriesSlug, season, episodeNumber) {
  const suffix = `-s${season}e${episodeNumber}`;
  return `${seriesSlug
    .slice(0, 80 - suffix.length)
    .replace(/-+$/g, '')}${suffix}`;
}

const sqlText = value =>
  value === null || value === undefined
    ? 'null'
    : `'${String(value).replace(/'/g, "''")}'`;

const sqlNumber = value =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'null'
    : String(Math.round(value));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `HTTP ${response.status} for ${url.split('?')[0]}: ${body.slice(
          0,
          300,
        )}`,
      );
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
    const body = await youtube(resource, {
      ...params,
      maxResults: 50,
      pageToken,
    });
    items.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

async function resolveChannelId(handleOrId) {
  if (/^UC[\w-]{20,}$/.test(handleOrId)) {
    return handleOrId;
  }

  const handle = handleOrId.startsWith('@') ? handleOrId : `@${handleOrId}`;
  try {
    const body = await youtube('channels', { part: 'id', forHandle: handle });
    const id = body.items?.[0]?.id ?? null;
    if (!id) {
      console.warn(
        `  ! ${handle} did not resolve to a channel -- skipping.\n` +
          '    Open https://www.youtube.com/' +
          handle +
          ' to check the handle,\n' +
          '    or pass the UC... id directly with --channels.',
      );
    }
    return id;
  } catch (error) {
    console.warn(`  ! ${handle} lookup failed (${error.message}) -- skipping.`);
    return null;
  }
}

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

      publishedAt: item.contentDetails?.videoPublishedAt ?? null,
      thumbnail: pickThumbnail(item.snippet?.thumbnails),
      position: item.snippet?.position ?? 0,
    }))
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
  if (
    Array.isArray(restriction.blocked) &&
    restriction.blocked.includes(region)
  ) {
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

async function fetchAniList(title) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(ANILIST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: title },
      }),
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
    channelIds.push({ handle, id });
    console.log(`  ${handle} -> ${id}`);
  }
}

if (!channelIds.length) {
  console.error('\nNo channels resolved -- nothing to import.');
  process.exit(1);
}

/** @type {Array<{channel: string, playlist: any}>} */
const candidates = [];
for (const { handle, id } of channelIds) {
  const playlists = await fetchSeriesPlaylists(id);
  console.log(
    `  ${handle}: ${playlists.length} playlist(s) look like a series`,
  );
  for (const playlist of playlists) {
    candidates.push({ channel: handle, playlist });
  }
}

candidates.sort(
  (a, b) =>
    (b.playlist.contentDetails?.itemCount ?? 0) -
    (a.playlist.contentDetails?.itemCount ?? 0),
);

const seriesRows = [];
const episodeRows = [];
const seenSlugs = new Set();
const seenTitles = new Set();

for (const { channel, playlist } of candidates) {
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
    await sleep(700);
  }

  if (meta?.isAdult) {
    console.log(`  - skipping "${searchTitle}" (AniList marks it adult)`);
    continue;
  }
  if (
    UNSUITABLE_PATTERN.test(rawTitle) ||
    UNSUITABLE_PATTERN.test(searchTitle)
  ) {
    continue;
  }

  const title = meta?.title?.english || meta?.title?.romaji || searchTitle;
  const slug = toSlug(`${title}`);
  if (!slug || seenSlugs.has(slug)) continue;

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

    fallbackNumber += 1;
    const episodeNumber = parsed ?? fallbackNumber;

    const slot = `${season}:${episodeNumber}`;
    if (usedSlots.has(slot)) {
      console.log(
        `  ! "${title}" S${season}E${episodeNumber} claimed twice -- keeping the first, dropping ${JSON.stringify(
          video.title,
        )}`,
      );
      continue;
    }
    usedSlots.add(slot);

    episodes.push({
      slug: episodeSlug(slug, season, episodeNumber),
      title: video.title.slice(0, 200),
      description:
        video.description.replace(/\s+/g, ' ').trim().slice(0, 1000) || null,
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

  episodeRows.push(
    ...episodes.map(episode => ({ ...episode, seriesSlug: slug })),
  );

  console.log(
    `  + ${title} -- ${episodes.length} episode(s) [${channel}]${
      meta ? '' : ' (no AniList match)'
    }`,
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

const sql = `-- Generated by scripts/import-anime.mjs on ${new Date()
  .toISOString()
  .slice(0, 10)}
-- Source: official YouTube channels (${[
  ...new Set(seriesRows.map(r => r.channel)),
].join(', ')})
-- Metadata: https://anilist.co${
  options.region ? `\n-- Region-checked against: ${options.region}` : ''
}
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
  .map(
    c => `  (${sqlText(c.slug)}, ${sqlText(c.name)}, '${c.kind}', ${c.sort})`,
  )
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
      `  (${sqlText(r.slug)}, ${sqlText(r.title)}, ${sqlText(
        r.description,
      )},\n` +
      `   ${sqlText(r.posterUrl)}, ${sqlText(r.backdropUrl)}, ${sqlNumber(
        r.releaseYear,
      )},\n` +
      `   'youtube', ${sqlText(r.sourceId)},\n` +
      `   (select id from public.categories where slug = ${sqlText(
        r.category.slug,
      )}), ${(i + 1) * 10})`,
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
      `  ((select id from public.series where slug = ${sqlText(
        r.seriesSlug,
      )}),\n` +
      `   ${sqlText(r.slug)}, ${sqlText(r.title)}, ${sqlText(
        r.description,
      )},\n` +
      `   ${sqlText(r.thumbnailUrl)}, ${sqlText(r.streamUrl)}, 'youtube',\n` +
      `   ${r.season}, ${r.episodeNumber}, ${sqlNumber(
        r.durationSeconds,
      )}, ${sqlText(r.airDate)})`,
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
