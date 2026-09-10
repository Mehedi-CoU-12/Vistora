#!/usr/bin/env node
// @ts-check
/**
 * Imports public-domain films, cartoons and anime from the Internet Archive
 * into a SQL seed file for `public.movies`.
 *
 * ---------------------------------------------------------------------------
 * Where the data comes from
 * ---------------------------------------------------------------------------
 * https://archive.org -- a library that HOSTS the files it indexes, so unlike
 * the IPTV catalogue these URLs are served by the rights-respecting party
 * itself and do not rot within months. Vistora still only stores the link and
 * hands it to the device (see README, "The one architectural rule").
 *
 * ---------------------------------------------------------------------------
 * What this script deliberately refuses to import
 * ---------------------------------------------------------------------------
 * "It is on archive.org" is NOT the same as "it is free to redistribute".
 * Anyone can upload, and collections like `feature_films` are full of ripped
 * modern releases sitting next to genuine public-domain prints. So the search
 * query itself requires an explicit `licenseurl` -- by default only a public
 * domain dedication. An item with no license metadata is never imported, even
 * if it looks old enough to be out of copyright: guessing the copyright status
 * of a film from its year is exactly the mistake this filter exists to prevent.
 *
 * That is a floor, not a guarantee, the same way the iptv-org blocklist is.
 * `--license=cc` additionally accepts Creative Commons items, which are
 * redistributable but usually carry attribution or non-commercial terms you
 * are then responsible for honouring. `--license=any` turns the check off and
 * should only be used with a hand-picked `--collections` you already trust.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   node scripts/import-archive.mjs                       # 40 PD feature films
 *   node scripts/import-archive.mjs --kind=cartoon        # PD cartoons
 *   node scripts/import-archive.mjs --kind=anime          # PD anime (see below)
 *   node scripts/import-archive.mjs --limit=100
 *   node scripts/import-archive.mjs --subjects=anime,manga
 *   node scripts/import-archive.mjs --min-year=1930 --max-year=1965
 *   node scripts/import-archive.mjs --collections=prelinger,classic_cartoons
 *   node scripts/import-archive.mjs --license=cc
 *   node scripts/import-archive.mjs --no-probe            # skip the liveness check
 *   node scripts/import-archive.mjs --out=supabase/seed_movies.sql
 *
 * Then review the file and apply it:
 *   psql "$DATABASE_URL" -f supabase/seed_movies.sql
 *
 * ---------------------------------------------------------------------------
 * A warning specific to --kind=anime
 * ---------------------------------------------------------------------------
 * Expect a SHORT list, possibly an empty one. The Archive has no anime
 * collection, and public-domain anime barely exists: essentially only pre-1953
 * Japanese animation has lapsed, and little of it is uploaded with the explicit
 * license metadata this script requires. So `anime` searches the broad
 * `animationandcartoons` umbrella narrowed by subject keywords, which is the
 * best available and still not much.
 *
 * It is wired up anyway because the kind is what makes the Anime tab real: with
 * `category_kind` carrying 'anime' (supabase/migrations/0002_add_anime_kind.sql)
 * you can point `--subjects` at whatever you do have the rights to, or insert
 * rows by hand against an anime category, and the app needs no change.
 *
 * That migration must be applied BEFORE the seed file this writes -- PostgreSQL
 * will not let a new enum value be used in the transaction that adds it, and
 * the generated file is one transaction.
 */

import {writeFile} from 'node:fs/promises';

/**
 * `advancedsearch.php`, not `services/search/v1/scrape`. The scrape endpoint is
 * the documented bulk API, but it intermittently answers with a cached total
 * for a completely different query -- during development it reported the same
 * `total` for `classic_cartoons` and `feature_films` minutes after reporting
 * the correct, very different numbers. advancedsearch has been consistent.
 */
const SEARCH = 'https://archive.org/advancedsearch.php';
const METADATA = 'https://archive.org/metadata';
/** Stable redirector. The `dnNNNNNN.us.archive.org` node it resolves to is not
 * stable, so storing the resolved URL would bake in a host that moves. */
const DOWNLOAD = 'https://archive.org/download';

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

const KINDS = ['movie', 'cartoon', 'anime'];

const kind = argv.get('kind') ?? 'movie';
if (!KINDS.includes(kind)) {
  throw new Error(`--kind must be one of ${KINDS.join(', ')}; got "${kind}"`);
}

const DEFAULT_COLLECTIONS = {
  // Curated cartoon collections. `animationandcartoons` is the broad umbrella
  // and carries a lot of modern amateur uploads, so it is not a default.
  cartoon: ['classic_cartoons', 'more_animation'],
  // `feature_films` is noisy on its own; the license filter is what makes it
  // usable, cutting ~28k items down to ~7.6k with a public domain dedication.
  movie: ['feature_films'],
  // There is no anime collection, so this has to be the broad umbrella --
  // which is exactly why anime is the one kind that also filters by subject.
  anime: ['animationandcartoons'],
};

/**
 * Subject keywords the search itself requires, per kind.
 *
 * Empty for films and cartoons, whose collections are already the filter --
 * `subject` on the Archive is a free-text bag of tags, so requiring one would
 * silently drop every correctly-licensed item that simply was not tagged.
 *
 * Anime is the exception and has no choice: its collection is the whole of
 * `animationandcartoons`, so without a subject clause `--kind=anime` would
 * return the same Betty Boop shorts as `--kind=cartoon`.
 */
const DEFAULT_SUBJECTS = {
  cartoon: [],
  movie: [],
  anime: ['anime', 'japanese animation', 'manga'],
};

/** Basename of the seed file each kind writes by default. */
const OUT_STEM = {movie: 'movies', cartoon: 'cartoons', anime: 'anime'};

/** Plural for log lines and messages. "animes" is not a word. */
const KIND_PLURAL = {
  movie: 'films',
  cartoon: 'cartoons',
  anime: 'anime titles',
};

const options = {
  kind,
  collections: list('collections', DEFAULT_COLLECTIONS[kind]),
  subjects: list('subjects', DEFAULT_SUBJECTS[kind]),
  license: argv.get('license') ?? 'pd',
  limit: number('limit', 40),
  minYear: number('min-year', null),
  maxYear: number('max-year', null),
  /** Archive items include one-minute fragments and slideshows. */
  minDurationSeconds: number('min-duration', 60),
  probe: argv.get('no-probe') !== 'true',
  concurrency: number('concurrency', 8),
  timeoutMs: number('timeout', 20_000),
  out: argv.get('out') ?? `supabase/seed_${OUT_STEM[kind]}.sql`,
};

if (!['pd', 'cc', 'any'].includes(options.license)) {
  throw new Error(`--license must be pd, cc or any, got "${options.license}"`);
}

// ---------------------------------------------------------------------------
// Subject keywords -> Vistora category
// ---------------------------------------------------------------------------
// `movies.category_id` holds exactly one category. Archive `subject` metadata
// is a free-text bag of tags, so the FIRST match in this order wins. The
// `action` and `animation` sort values match supabase/seed.sql so that
// re-running this importer does not reshuffle categories that already exist.

const MOVIE_CATEGORIES = [
  {slug: 'action', name: 'Action', kind: 'movie', sort: 10, match: ['action', 'adventure', 'war', 'martial arts', 'swashbuckler']},
  {slug: 'animation', name: 'Animation', kind: 'movie', sort: 20, match: ['animation', 'animated', 'cartoon']},
  {slug: 'horror', name: 'Horror', kind: 'movie', sort: 30, match: ['horror', 'monster', 'zombie', 'vampire']},
  {slug: 'sci-fi', name: 'Sci-Fi', kind: 'movie', sort: 40, match: ['science fiction', 'sci-fi', 'scifi', 'space']},
  {slug: 'comedy', name: 'Comedy', kind: 'movie', sort: 50, match: ['comedy', 'slapstick', 'humor', 'humour', 'farce']},
  {slug: 'western', name: 'Western', kind: 'movie', sort: 60, match: ['western', 'cowboy']},
  {slug: 'mystery', name: 'Mystery & Noir', kind: 'movie', sort: 70, match: ['noir', 'mystery', 'detective', 'crime', 'thriller', 'suspense']},
  {slug: 'romance', name: 'Romance', kind: 'movie', sort: 80, match: ['romance', 'romantic', 'love']},
  {slug: 'documentary', name: 'Documentary', kind: 'movie', sort: 90, match: ['documentary', 'newsreel', 'educational']},
  {slug: 'classics', name: 'Classics', kind: 'movie', sort: 100, match: []}, // fallback
];

const CARTOON_CATEGORIES = [
  {slug: 'kids-cartoons', name: 'Cartoons', kind: 'cartoon', sort: 10, match: []}, // fallback
];

// Anime gets more than one bucket even though the corpus is tiny, because the
// Anime tab's category filter reads these: a single category would render a
// picker with one option in it.
const ANIME_CATEGORIES = [
  {slug: 'anime-classic', name: 'Classic Anime', kind: 'anime', sort: 10, match: ['1930', '1940', 'senkousha', 'kenzo', 'ofuji']},
  {slug: 'anime-shorts', name: 'Shorts', kind: 'anime', sort: 20, match: ['short', 'shorts']},
  {slug: 'anime-series', name: 'Series', kind: 'anime', sort: 30, match: ['series', 'episode', 'tv']},
  {slug: 'anime-films', name: 'Films', kind: 'anime', sort: 40, match: []}, // fallback
];

const CATEGORIES_BY_KIND = {
  movie: MOVIE_CATEGORIES,
  cartoon: CARTOON_CATEGORIES,
  anime: ANIME_CATEGORIES,
};

const CATEGORIES = CATEGORIES_BY_KIND[options.kind];

function categoryFor(tags) {
  const haystack = tags.join(' ').toLowerCase();
  for (const rule of CATEGORIES) {
    if (rule.match.some(m => haystack.includes(m))) return rule;
  }
  return CATEGORIES.at(-1);
}

/**
 * The Archive has no reliable "adult" or "graphic content" flag, and the
 * public-domain corpus is where two awkward genres concentrate: 1930s
 * exploitation pictures, and wartime atrocity footage that entered the public
 * domain because it was filmed as government evidence (`Nazi Concentration
 * Camps`, a Nuremberg exhibit, ranks high by downloads and WILL be imported
 * without this). Both are legally free to redistribute and neither belongs on
 * a living-room TV grid next to Popeye.
 *
 * Matched against the title only -- descriptions produce far too many false
 * positives -- and always on, with no flag to disable it, for the same reason
 * the IPTV importer's blocklist has none. Word boundaries matter: a substring
 * match on "sex" also rejects "Middlesex".
 */
const UNSUITABLE_PATTERN =
  /\b(sex|sexy|nude|nudist|nudes|naked|porn|porno|erotic|erotica|xxx|striptease|burlesque|smut|vice|atrocity|atrocities|massacre|lynching|execution|autopsy|concentration camps?|holocaust)\b/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Must satisfy the `public.slug` domain: ^[a-z0-9]+(?:-[a-z0-9]+)*$, 2..80. */
function toSlug(title, suffix) {
  const base = `${title}${suffix ? `-${suffix}` : ''}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : null;
}

/** Must satisfy the `public.http_url` domain: absolute http(s), no whitespace. */
function isUsableUrl(url) {
  return typeof url === 'string' && !/\s/.test(url) && /^https:\/\/\S+$/i.test(url);
}

const sqlText = value =>
  value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`;

const sqlNumber = value =>
  value === null || value === undefined || !Number.isFinite(value) ? 'null' : String(Math.round(value));

/** Archive `length` is either "380.61" seconds or "6:20" / "1:06:20". */
function toSeconds(length) {
  if (typeof length === 'number') return length > 0 ? length : null;
  if (typeof length !== 'string') return null;
  if (!length.includes(':')) {
    const seconds = Number(length);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  const total = length
    .split(':')
    .map(Number)
    .reduce((acc, part) => (Number.isFinite(part) ? acc * 60 + part : NaN), 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

/** Archive metadata fields are a string when single-valued, an array when not. */
const toArray = value => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

/** Runs `worker` over `items` with a fixed number of workers in flight. */
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function buildQuery() {
  const clauses = ['mediatype:(movies)'];
  clauses.push(`collection:(${options.collections.join(' OR ')})`);

  // Quoted because the useful keywords are phrases ("japanese animation"), and
  // an unquoted phrase would be parsed as two independent terms.
  if (options.subjects.length) {
    const terms = options.subjects.map(term => `"${term}"`).join(' OR ');
    clauses.push(`subject:(${terms})`);
  }

  if (options.license === 'pd') clauses.push('licenseurl:(*publicdomain* OR *mark\\/1.0*)');
  else if (options.license === 'cc') clauses.push('licenseurl:(*creativecommons.org*)');

  if (options.minYear !== null || options.maxYear !== null) {
    clauses.push(`year:[${options.minYear ?? 1888} TO ${options.maxYear ?? 2100}]`);
  }
  return clauses.join(' AND ');
}

/**
 * Sorted by downloads so a small `--limit` returns the well-known titles rather
 * than an arbitrary slice. Over-fetches because a good fraction of candidates
 * drop out later for having no playable MP4 derivative.
 */
async function search(query, wanted) {
  const rows = 100;
  const docs = [];
  for (let page = 1; docs.length < wanted; page++) {
    const url = new URL(SEARCH);
    url.searchParams.set('q', query);
    for (const field of ['identifier', 'title', 'year', 'date', 'description', 'subject', 'licenseurl', 'downloads']) {
      url.searchParams.append('fl[]', field);
    }
    url.searchParams.append('sort[]', 'downloads desc');
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('page', String(page));
    url.searchParams.set('output', 'json');

    const body = await getJson(url.toString());
    const batch = body?.response?.docs ?? [];
    docs.push(...batch);
    if (batch.length < rows) break; // last page
  }
  return docs.slice(0, wanted);
}

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

/**
 * Strips the derivative suffix the Archive appends when it transcodes, so that
 * `Popeye.mp4` and `Popeye_512kb.mp4` are recognised as one film in two
 * qualities rather than two films.
 */
const baseName = name => name.replace(/(_\d+kb)?(\.ia)?\.mp4$/i, '').toLowerCase();

/**
 * Media3 on Android TV plays progressive MP4 and HLS. The Archive's other
 * derivatives -- `.ogv`, `.divx`, `.mpg` -- either will not play or will not
 * seek, so an item with no MP4 is skipped rather than imported broken.
 * Highest resolution wins; the `_512kb.mp4` derivative is the fallback that
 * almost every item has.
 *
 * Returns null for a COMPILATION -- one Archive item holding several distinct
 * films, like `MorePopeyeCartoons` with five unrelated shorts in it. A row in
 * `movies` is one title with one `stream_url`, so importing a compilation
 * means picking one short arbitrarily and captioning it with the uploader's
 * collection title. Better to skip it than to ship a card that lies.
 */
function pickVideo(files) {
  const candidates = files
    .filter(f => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.mp4'))
    .map(f => ({
      name: f.name,
      height: Number(f.height) || 0,
      size: Number(f.size) || 0,
      seconds: toSeconds(f.length),
    }));
  if (!candidates.length) return null;
  if (new Set(candidates.map(c => baseName(c.name))).size > 1) return null;

  candidates.sort((a, b) => b.height - a.height || b.size - a.size);
  return candidates[0];
}

/**
 * A stream counts as usable only if the redirector resolves and the node
 * answers with a video content type. Archive items are occasionally "dark"
 * (withdrawn after a rights claim) while still appearing in the search index,
 * and those answer 403 here -- which is precisely the case worth catching.
 */
async function isPlayable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      // Ask for one byte: enough to prove the node serves the file, without
      // pulling a 700 MB feature film through the runner.
      headers: {Range: 'bytes=0-0'},
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    return (response.headers.get('content-type') ?? '').toLowerCase().startsWith('video/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const query = buildQuery();
console.log(`searching archive.org: ${query}`);

// Over-fetch: items without an MP4 derivative, without a duration, or with an
// adult-sounding title all drop out below.
const docs = await search(query, options.limit * 3);
console.log(`${docs.length} candidates`);

const seenSlugs = new Set();
const seenTitles = new Set();
const rows = [];

const enriched = await mapPool(docs, options.concurrency, async doc => {
  try {
    return {doc, meta: await getJson(`${METADATA}/${doc.identifier}`)};
  } catch {
    return null;
  }
});

for (const entry of enriched) {
  if (rows.length >= options.limit) break;
  if (!entry?.meta?.files) continue;

  const {doc, meta} = entry;
  const title = String(toArray(meta.metadata?.title ?? doc.title)[0] ?? '').trim();
  if (!title) continue;
  if (UNSUITABLE_PATTERN.test(title)) continue;

  // The Archive holds many near-duplicate uploads of the same print, with
  // different identifiers. One card per film.
  const titleKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (seenTitles.has(titleKey)) continue;

  const video = pickVideo(meta.files);
  if (!video) continue;

  const seconds = video.seconds;
  if (seconds !== null && seconds < options.minDurationSeconds) continue;

  const streamUrl = `${DOWNLOAD}/${encodeURIComponent(doc.identifier)}/${video.name
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  if (!isUsableUrl(streamUrl)) continue;

  const yearRaw = Number(toArray(meta.metadata?.year ?? doc.year)[0]);
  const dateYear = Number(String(toArray(meta.metadata?.date ?? doc.date)[0] ?? '').slice(0, 4));
  const year = [yearRaw, dateYear].find(y => Number.isInteger(y) && y >= 1888 && y <= 2100) ?? null;

  const slug = toSlug(title, year ?? doc.identifier);
  if (!slug || seenSlugs.has(slug)) continue;

  const description = String(toArray(meta.metadata?.description ?? doc.description)[0] ?? '')
    .replace(/<[^>]*>/g, ' ') // Archive descriptions are HTML
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000) || null;

  const tags = [...toArray(meta.metadata?.subject ?? doc.subject), ...toArray(meta.metadata?.collection)]
    .map(String)
    .flatMap(s => s.split(/[;,]/));

  seenSlugs.add(slug);
  seenTitles.add(titleKey);

  rows.push({
    slug,
    title,
    description,
    poster_url: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    stream_url: streamUrl,
    release_year: year,
    duration_seconds: seconds,
    category: categoryFor(tags),
    identifier: doc.identifier,
    license: String(toArray(meta.metadata?.licenseurl ?? doc.licenseurl)[0] ?? ''),
  });
}

console.log(
  `${rows.length} importable ${KIND_PLURAL[options.kind]} (license-filtered, deduplicated)`,
);

let final = rows;
if (options.probe) {
  console.log(`probing ${final.length} files with ${options.concurrency} in flight...`);
  const verdicts = await mapPool(final, options.concurrency, r => isPlayable(r.stream_url));
  final = final.filter((_, i) => verdicts[i]);
  console.log(`playable: ${final.length} / ${verdicts.length}`);
}

if (!final.length) {
  console.error('nothing to import -- refusing to write an empty seed file');
  if (options.kind === 'anime') {
    console.error(
      'For anime this is the expected outcome more often than not: see the\n' +
        'warning in this script\'s header. Try --license=cc, a wider\n' +
        '--subjects, or your own --collections.',
    );
  }
  process.exit(1);
}

final.sort((a, b) => a.category.sort - b.category.sort || a.title.localeCompare(b.title));

const usedCategories = CATEGORIES.filter(rule => final.some(r => r.category.slug === rule.slug));

const sql = `-- Generated by scripts/import-archive.mjs on ${new Date().toISOString().slice(0, 10)}
-- Source: https://archive.org (hosts the files it indexes)
-- Filters: kind=${options.kind} collections=${options.collections.join(',')} license=${options.license}${
  options.subjects.length ? ` subjects=${options.subjects.join(',')}` : ''
}${
  options.minYear !== null || options.maxYear !== null
    ? ` years=${options.minYear ?? '*'}..${options.maxYear ?? '*'}`
    : ''
}${options.probe ? ' probed=playable' : ' unprobed'}
--
-- Every row below carries an explicit redistributable license in its Archive
-- metadata; items with no license are never emitted. See the script header.

begin;

insert into public.categories (slug, name, kind, sort_order) values
${usedCategories
  .map(c => `  (${sqlText(c.slug)}, ${sqlText(c.name)}, '${c.kind}', ${c.sort})`)
  .join(',\n')}
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      sort_order = excluded.sort_order;

insert into public.movies
  (slug, title, description, poster_url, stream_url, stream_protocol,
   release_year, duration_seconds, category_id, sort_order)
values
${final
  .map(
    (r, i) =>
      `  -- ${r.identifier} (${r.license})\n` +
      `  (${sqlText(r.slug)}, ${sqlText(r.title)}, ${sqlText(r.description)},\n` +
      `   ${sqlText(r.poster_url)}, ${sqlText(r.stream_url)}, 'mp4',\n` +
      `   ${sqlNumber(r.release_year)}, ${sqlNumber(r.duration_seconds)},\n` +
      `   (select id from public.categories where slug = ${sqlText(r.category.slug)}), ${(i + 1) * 10})`,
  )
  .join(',\n')}
on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      poster_url = excluded.poster_url,
      stream_url = excluded.stream_url,
      stream_protocol = excluded.stream_protocol,
      release_year = excluded.release_year,
      duration_seconds = excluded.duration_seconds,
      category_id = excluded.category_id,
      sort_order = excluded.sort_order,
      is_active = true;

commit;
`;

await writeFile(options.out, sql, 'utf8');

console.log(`\nwrote ${options.out}`);
console.log(
  `  ${final.length} ${KIND_PLURAL[options.kind]}, ${usedCategories.length} categories`,
);
console.log(`\nreview it, then:  psql "$DATABASE_URL" -f ${options.out}`);
