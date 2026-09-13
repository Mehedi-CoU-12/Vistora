const BASE = 'https://api.jikan.moe/v4';

const WATCH = 'https://www.youtube.com/watch';

const LISTS = {
  popular: { filter: 'bypopularity' },
  'top-rated': { filter: '' }, // /top/anime's own default ordering is by score
  airing: { filter: 'airing' },
  upcoming: { filter: 'upcoming' },
  favorite: { filter: 'favorite' },
};

const PER_PAGE = 25;

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
      title: anime.title_english || anime.title,
      description: String(anime.synopsis ?? '')
        .replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '')
        .trim(),

      posterUrl: images.large_image_url ?? images.image_url ?? null,
      backdropUrl: null,

      streamUrl: `${WATCH}?v=${encodeURIComponent(key)}`,
      protocol: 'youtube',

      releaseYear: year,

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
