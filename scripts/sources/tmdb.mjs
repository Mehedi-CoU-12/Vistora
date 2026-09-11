const BASE = 'https://api.themoviedb.org/3';

const IMAGES = 'https://image.tmdb.org/t/p';

const WATCH = 'https://www.youtube.com/watch';

const LISTS = {
  trending: {
    path: 'trending/movie/week',
    category: { slug: 'trending', name: 'Trending', kind: 'movie', sort: 10 },
  },
  popular: {
    path: 'movie/popular',
    category: { slug: 'popular', name: 'Popular', kind: 'movie', sort: 20 },
  },
  'now-playing': {
    path: 'movie/now_playing',
    category: {
      slug: 'in-cinemas',
      name: 'In Cinemas',
      kind: 'movie',
      sort: 30,
    },
  },
  'top-rated': {
    path: 'movie/top_rated',
    category: { slug: 'top-rated', name: 'Top Rated', kind: 'movie', sort: 40 },
  },
};

export const meta = {
  description: 'TMDB catalogue metadata, streaming the official trailer',
  homepage: 'https://www.themoviedb.org',
  license:
    'TMDB API terms -- metadata and images licensed for this use, ' +
    'attribution required; streams are publisher-hosted YouTube trailers',

  options: {
    lists: `which lists to pull: ${Object.keys(LISTS).join(
      ', ',
    )} (default all)`,
    pages: 'pages per list, 20 titles each (default 1)',
    language: 'TMDB language for titles and synopses (default en-US)',
    region: 'ISO 3166-1 country for release dates (default US)',
    teasers: 'accept a teaser when a film has no full trailer (default true)',
  },

  // All four are declared whatever --lists selects; scrape.mjs emits only the
  // ones that end up with rows in them.
  categories: Object.values(LISTS).map(list => list.category),
};

/** Keeps a v3 key out of anything we print, including CI logs. */
const redact = value =>
  String(value ?? '').replace(/(api_key=)[^&\s]+/gi, '$1REDACTED');

function credentials() {
  const raw = (
    process.env.TMDB_READ_ACCESS_TOKEN ??
    process.env.TMDB_API_KEY ??
    ''
  ).trim();

  if (!raw) {
    throw new Error(
      'TMDB_API_KEY is not set.\n\n' +
        'This source needs a free TMDB credential. It is read by Node at\n' +
        'scrape time and must NOT go in .env -- see the header of\n' +
        'scripts/sources/tmdb.mjs.\n\n' +
        '  export TMDB_API_KEY=...\n' +
        '  npm run scrape:tmdb\n\n' +
        'Create one at https://www.themoviedb.org/settings/api',
    );
  }

  return raw.includes('.') && raw.length > 64
    ? { header: `Bearer ${raw}` }
    : { query: raw };
}

/** One TMDB call. Throws with the site's own wording when it can. */
async function api(ctx, auth, path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  if (auth.query) url.searchParams.set('api_key', auth.query);

  try {
    return await ctx.fetchJson(
      url.toString(),
      auth.header ? { headers: { Authorization: auth.header } } : undefined,
    );
  } catch (error) {
    const message = redact(error?.message);
    if (/HTTP 401/.test(message)) {
      throw new Error(
        'TMDB rejected the credential (401). A v3 key is 32 hex characters; ' +
          'a v4 read access token is a long JWT. Check the value in ' +
          'TMDB_API_KEY against https://www.themoviedb.org/settings/api',
      );
    }
    throw Object.assign(new Error(message), { fatal: error?.fatal });
  }
}

/**
 * The trailer to play for one film, or null if it has none on YouTube.
 *
 * Official studio uploads first, then anything else; within a tier the newest
 * wins, because remasters and re-releases post fresh trailers and the oldest
 * uploads are the first to be pulled.
 */
function pickTrailer(videos, kinds) {
  const candidates = (Array.isArray(videos) ? videos : []).filter(
    video =>
      video?.site === 'YouTube' &&
      typeof video.key === 'string' &&
      video.key.length > 0 &&
      kinds.includes(video.type),
  );
  if (!candidates.length) return null;

  const rank = video => (video.official ? 0 : 10) + kinds.indexOf(video.type);
  candidates.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      String(b.published_at ?? '').localeCompare(String(a.published_at ?? '')),
  );
  return candidates[0];
}

export async function scrape(ctx) {
  const auth = credentials();
  const language = ctx.option('language', 'en-US');
  const region = ctx.option('region', 'US');
  const pages = Math.max(1, Math.trunc(ctx.number('pages', 1)));
  const kinds = ctx.bool('teasers', true) ? ['Trailer', 'Teaser'] : ['Trailer'];

  const requested = ctx.list('lists', Object.keys(LISTS));
  const unknown = requested.filter(name => !LISTS[name]);
  if (unknown.length) {
    throw new Error(
      `--lists: no such list "${unknown[0]}". ` +
        `Available: ${Object.keys(LISTS).join(', ')}`,
    );
  }
  // Declared order, not the order they were typed, so overlaps resolve the
  // same way on every run.
  const selected = Object.keys(LISTS).filter(name => requested.includes(name));

  // -- 1. candidate films, deduplicated by TMDB id --------------------------
  //
  // Deduplicating here rather than leaving it to the runner matters: the
  // trailer lookup below is one request per film, and the popular lists
  // overlap heavily.

  /** @type {Map<number, {film: object, category: object, list: string}>} */
  const candidates = new Map();

  for (const name of selected) {
    const { path, category } = LISTS[name];
    let added = 0;

    for (let page = 1; page <= pages; page++) {
      const body = await api(ctx, auth, path, { language, region, page });
      const results = Array.isArray(body?.results) ? body.results : [];
      if (!results.length) break;

      for (const film of results) {
        if (!film?.id || candidates.has(film.id)) continue;
        candidates.set(film.id, { film, category, list: name });
        added += 1;
      }

      if (body.total_pages && page >= body.total_pages) break;
    }

    ctx.log(`  ${name}: ${added} new title(s)`);
  }

  // -- 2. a trailer for each, stopping once the limit is met ----------------
  //
  // Films are visited in list order, so --limit trims the tail (top-rated)
  // rather than a random slice.

  const items = [];
  let looked = 0;
  let untrailered = 0;

  for (const { film, category, list } of candidates.values()) {
    if (items.length >= ctx.limit) break;
    looked += 1;

    let videos = await api(ctx, auth, `movie/${film.id}/videos`, { language });
    let trailer = pickTrailer(videos?.results, kinds);

    // TMDB filters videos by language, so a film whose trailer was only ever
    // uploaded untagged or in its original language comes back empty. One
    // unfiltered retry recovers those, and costs a request only for the
    // films that would otherwise be dropped.
    if (!trailer) {
      videos = await api(ctx, auth, `movie/${film.id}/videos`);
      trailer = pickTrailer(videos?.results, kinds);
    }

    if (!trailer) {
      untrailered += 1;
      continue;
    }

    const title = film.title || film.original_title;
    const year = Number(String(film.release_date ?? '').slice(0, 4));

    items.push({
      title,
      description: film.overview,
      posterUrl: film.poster_path ? `${IMAGES}/w500${film.poster_path}` : null,
      backdropUrl: film.backdrop_path
        ? `${IMAGES}/w1280${film.backdrop_path}`
        : null,

      streamUrl: `${WATCH}?v=${encodeURIComponent(trailer.key)}`,
      protocol: 'youtube',

      releaseYear: Number.isFinite(year) ? year : null,

      // Deliberately null. duration_seconds describes the stream everywhere
      // else in this project (see scripts/import-anime.mjs), and the stream
      // here is a two-minute trailer -- filling in the film's 120-minute
      // runtime would make every progress bar and "time remaining" lie.
      durationSeconds: null,

      category: category.slug,
      note: `TMDB ${film.id} (${list}) -- ${
        trailer.official ? 'official ' : ''
      }${String(trailer.type).toLowerCase()}`,
    });
  }

  ctx.log(
    `\n  ${candidates.size} unique title(s), looked up ${looked}, ` +
      `${untrailered} with no YouTube trailer`,
  );

  return items;
}
