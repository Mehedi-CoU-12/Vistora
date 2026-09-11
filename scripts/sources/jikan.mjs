// ---------------------------------------------------------------------------
// The MyAnimeList catalogue, through Jikan.
//
// WHY THIS IS A CATALOGUE AND NOT A LIBRARY OF EPISODES
//
// README.md ("There is no source that gives you 'any anime'") is the long
// version. The short one: every anime made in the last seventy years is
// exclusively licensed, and no licensee publishes a stream URL. So this source
// does what scripts/sources/tmdb.mjs does for films -- it fills the app with
// the *catalogue*: poster, synopsis, year, genre, and the publisher's own
// trailer as the stream. It is what makes the Anime tab look like a library
// rather than a shelf of six titles.
//
// For episodes you can actually sit and watch, use scripts/import-anime.mjs
// (workflow source `anime`), which walks the official licensor channels on
// YouTube and writes real series/episodes rows. The two are complementary and
// upsert on slug, so running both leaves the episode rows in place.
//
// WHY JIKAN AND NOT ANILIST
//
// import-anime.mjs enriches from AniList, and AniList's GraphQL API is at time
// of writing returning `403 The AniList API has been temporarily disabled due
// to severe stability issues` to every query. Jikan is an independent,
// keyless, read-only mirror of MyAnimeList -- a different upstream, so an
// outage of one does not take out the other.
//
// Jikan asks for no credential at all, which is the point: unlike `tmdb` this
// source runs on a fork with no secrets configured.
// ---------------------------------------------------------------------------

const BASE = 'https://api.jikan.moe/v4';

const WATCH = 'https://www.youtube.com/watch';

/**
 * Every list is the same resource under a different `filter`, so they all page
 * identically and a page of one costs exactly what a page of another does.
 */
const LISTS = {
  popular: { filter: 'bypopularity' },
  'top-rated': { filter: '' }, // /top/anime's own default ordering is by score
  airing: { filter: 'airing' },
  upcoming: { filter: 'upcoming' },
  favorite: { filter: 'favorite' },
};

/** Jikan's hard ceiling for `limit`. Asking for more is silently truncated. */
const PER_PAGE = 25;

// Deliberately the same slugs, kinds and sort orders as the buckets in
// scripts/import-anime.mjs and scripts/import-archive.mjs. The Anime tab reads
// one set of shelves, so a catalogue row and a watchable series row for the
// same genre have to land on the same one -- otherwise the tab grows a second,
// near-identical "Action" row depending on which importer ran last.
const CATEGORIES = [
  { slug: 'anime-series', name: 'Series', kind: 'anime', sort: 30, match: [] },
  { slug: 'anime-films', name: 'Films', kind: 'anime', sort: 40, match: [] },
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
];

export const meta = {
  description:
    'The MyAnimeList catalogue via Jikan, streaming the official trailer',
  homepage: 'https://jikan.moe',
  license:
    'Jikan is a free, keyless, read-only MyAnimeList mirror; artwork and ' +
    'synopses are MyAnimeList’s, streams are publisher-hosted YouTube trailers',

  options: {
    lists: `which lists to pull: ${Object.keys(LISTS).join(
      ', ',
    )} (default popular, top-rated)`,
    pages: `pages per list, ${PER_PAGE} titles each (default 4)`,
    types:
      'MAL types to keep: tv, movie, ona, ova, special (default tv, movie)',
    'min-score': 'drop anything scoring below this out of 10 (default 0)',
    pace: 'ms between Jikan calls -- it allows 3/s and 60/min (default 1200)',
  },

  categories: CATEGORIES,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Jikan proxies MyAnimeList, and MyAnimeList goes down. When it does Jikan
 * answers 504 for anything not already in its cache, which during a wobble
 * means page 1 returns and page 2 does not -- so this is not the runner's
 * ordinary flakiness and the runner's 0.5s/1s backoff is too short for it.
 * Waits here are seconds, not milliseconds, and a page that never arrives is
 * skipped rather than fatal: a partial catalogue beats an aborted run.
 */
async function page(ctx, url, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const body = await ctx.fetchJson(url);
      if (Array.isArray(body?.data)) return body;
      throw new Error('no data[] in the response');
    } catch (error) {
      const last = attempt === attempts;
      const message = String(error?.message ?? error);
      if (last) {
        ctx.log(`    ! gave up on ${url.split('/v4/')[1]} -- ${message}`);
        return null;
      }
      // 504 is MyAnimeList, not us; 429 is Jikan's own minute bucket. Both
      // want a wait long enough to matter.
      await sleep(3000 * attempt);
    }
  }
  return null;
}

/**
 * The trailer's YouTube id.
 *
 * `youtube_id` is the documented field and is frequently null on records whose
 * `embed_url` plainly contains the id -- Frieren is one. Reading the embed URL
 * as a fallback is worth roughly a fifth of the catalogue.
 */
function trailerId(trailer) {
  const direct = trailer?.youtube_id;
  if (typeof direct === 'string' && /^[A-Za-z0-9_-]{11}$/.test(direct)) {
    return direct;
  }
  const embedded = String(trailer?.embed_url ?? '').match(
    /\/embed\/([A-Za-z0-9_-]{11})/,
  );
  return embedded ? embedded[1] : null;
}

// MAL's own content rating is the reliable signal, and it is the ONLY one
// here: /top/anime ignores Jikan's `sfw=true`, and passing it anyway is worse
// than useless -- it changes the cache key, so during a MyAnimeList wobble the
// request misses Jikan's cache and 504s where the unadorned one is served.
// Hence three client-side checks: the rating, the genre list, and the title.
const BLOCKED_RATING = /^(rx|r\+)\b/i;
const BLOCKED_GENRES = new Set(['hentai', 'erotica', 'ecchi']);
const UNSUITABLE_PATTERN =
  /\b(sex|sexy|nude|naked|porn|porno|erotic|erotica|xxx|hentai|ecchi|striptease|smut)\b/i;

function isUnsuitable(anime, genres) {
  if (BLOCKED_RATING.test(String(anime?.rating ?? ''))) return true;
  if (genres.some(genre => BLOCKED_GENRES.has(genre))) return true;
  return (
    UNSUITABLE_PATTERN.test(String(anime?.title ?? '')) ||
    UNSUITABLE_PATTERN.test(String(anime?.title_english ?? ''))
  );
}

/** Genres lowercased across all three of MAL's parallel taxonomies. */
const genresOf = anime =>
  [
    ...(anime?.genres ?? []),
    ...(anime?.themes ?? []),
    ...(anime?.demographics ?? []),
  ]
    .map(entry => String(entry?.name ?? '').toLowerCase())
    .filter(Boolean);

function categoryFor(anime, genres) {
  // A film goes on the Films shelf whatever its genre: the Anime tab
  // interleaves series and films, and "is this 24 minutes or two hours" is the
  // distinction a viewer is actually making at that moment.
  if (String(anime?.type ?? '').toLowerCase() === 'movie') return 'anime-films';

  for (const category of CATEGORIES) {
    if (category.match.some(needle => genres.includes(needle))) {
      return category.slug;
    }
  }
  return 'anime-series';
}

export async function scrape(ctx) {
  const pages = Math.max(1, Math.trunc(ctx.number('pages', 4)));
  const pace = Math.max(0, ctx.number('pace', 1200));
  const minScore = ctx.number('min-score', 0);
  const types = new Set(
    ctx.list('types', ['tv', 'movie']).map(type => type.toLowerCase()),
  );

  const requested = ctx.list('lists', ['popular', 'top-rated']);
  const unknown = requested.filter(name => !LISTS[name]);
  if (unknown.length) {
    throw new Error(
      `--lists: no such list "${unknown[0]}". ` +
        `Available: ${Object.keys(LISTS).join(', ')}`,
    );
  }
  // Declared order rather than typed order, so overlapping lists resolve the
  // same way on every run.
  const selected = Object.keys(LISTS).filter(name => requested.includes(name));

  /** @type {Map<number, object>} MAL id -> the first record that claimed it. */
  const byId = new Map();

  for (const name of selected) {
    const { filter } = LISTS[name];
    let added = 0;

    for (let index = 1; index <= pages; index++) {
      const url = new URL(`${BASE}/top/anime`);
      url.searchParams.set('page', String(index));
      url.searchParams.set('limit', String(PER_PAGE));
      if (filter) url.searchParams.set('filter', filter);

      const body = await page(ctx, url.toString());
      // Pacing goes here rather than around the retry, so a retried page is
      // not also charged the polite delay three times over.
      if (pace) await sleep(pace);
      if (!body) continue;

      if (!body.data.length) break;

      for (const anime of body.data) {
        const id = anime?.mal_id;
        if (!Number.isFinite(id) || byId.has(id)) continue;
        byId.set(id, anime);
        added += 1;
      }

      if (body.pagination?.has_next_page === false) break;
    }

    ctx.log(`  ${name}: ${added} new title(s)`);
  }

  // -- catalogue records to items -------------------------------------------
  //
  // The runner enforces --limit itself, but the counters below are the only
  // way to tell "Jikan was down" from "these titles have no trailer", and the
  // two want completely different fixes.

  const items = [];
  let untrailered = 0;
  let filtered = 0;

  for (const anime of byId.values()) {
    const genres = genresOf(anime);

    if (!types.has(String(anime.type ?? '').toLowerCase())) {
      filtered += 1;
      continue;
    }
    if (isUnsuitable(anime, genres)) {
      filtered += 1;
      continue;
    }
    if (minScore > 0 && !(Number(anime.score) >= minScore)) {
      filtered += 1;
      continue;
    }

    const key = trailerId(anime.trailer);
    if (!key) {
      untrailered += 1;
      continue;
    }

    const images = anime.images?.jpg ?? {};
    const year =
      Number(anime.year) || Number(anime.aired?.prop?.from?.year) || null;

    items.push({
      // MAL indexes by the romaji title; the English one is what a viewer
      // scanning the grid recognises. Prefer it, fall back rather than drop.
      title: anime.title_english || anime.title,
      description: String(anime.synopsis ?? '')
        .replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '')
        .trim(),

      posterUrl: images.large_image_url ?? images.image_url ?? null,
      // MAL serves no 16:9 art, and the poster stretched across a backdrop
      // slot looks worse than no backdrop at all. Left null on purpose.
      backdropUrl: null,

      streamUrl: `${WATCH}?v=${encodeURIComponent(key)}`,
      protocol: 'youtube',

      releaseYear: year,

      // Null on purpose, exactly as in scripts/sources/tmdb.mjs:
      // duration_seconds describes the STREAM everywhere in this schema, and
      // the stream here is a 90-second trailer. Writing the episode's 24
      // minutes would make every progress bar in the app lie.
      durationSeconds: null,

      category: categoryFor(anime, genres),
      note: `MAL ${anime.mal_id} (${anime.type}${
        anime.episodes ? `, ${anime.episodes} ep` : ''
      })`,
    });
  }

  ctx.log(
    `\n  ${byId.size} unique title(s), ${filtered} filtered out, ` +
      `${untrailered} with no trailer`,
  );

  return items;
}
