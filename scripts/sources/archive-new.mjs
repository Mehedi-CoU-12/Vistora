import { readFile, writeFile } from 'node:fs/promises';

const SEARCH = 'https://archive.org/advancedsearch.php';
const METADATA = 'https://archive.org/metadata';
/** Stable redirector. The `dnNNNNNN.us.archive.org` node it resolves to is not
 * stable, so storing the resolved URL would bake in a host that moves. */
const DOWNLOAD = 'https://archive.org/download';

const DEFAULT_LEDGER = 'supabase/.scrape-ledger-archive-new.json';

const CATEGORIES = [
  {
    slug: 'action',
    name: 'Action',
    kind: 'movie',
    sort: 10,
    match: ['action', 'adventure', 'war', 'martial arts', 'swashbuckler'],
  },
  {
    slug: 'animation',
    name: 'Animation',
    kind: 'movie',
    sort: 20,
    match: ['animation', 'animated', 'cartoon'],
  },
  {
    slug: 'horror',
    name: 'Horror',
    kind: 'movie',
    sort: 30,
    match: ['horror', 'monster', 'zombie', 'vampire'],
  },
  {
    slug: 'sci-fi',
    name: 'Sci-Fi',
    kind: 'movie',
    sort: 40,
    match: ['science fiction', 'sci-fi', 'scifi', 'space'],
  },
  {
    slug: 'comedy',
    name: 'Comedy',
    kind: 'movie',
    sort: 50,
    match: ['comedy', 'slapstick', 'humor', 'humour', 'farce'],
  },
  {
    slug: 'western',
    name: 'Western',
    kind: 'movie',
    sort: 60,
    match: ['western', 'cowboy'],
  },
  {
    slug: 'mystery',
    name: 'Mystery & Noir',
    kind: 'movie',
    sort: 70,
    match: ['noir', 'mystery', 'detective', 'crime', 'thriller', 'suspense'],
  },
  {
    slug: 'romance',
    name: 'Romance',
    kind: 'movie',
    sort: 80,
    match: ['romance', 'romantic', 'love'],
  },
  {
    slug: 'documentary',
    name: 'Documentary',
    kind: 'movie',
    sort: 90,
    match: ['documentary', 'newsreel', 'educational'],
  },
  { slug: 'classics', name: 'Classics', kind: 'movie', sort: 100, match: [] },
];

export const meta = {
  description: 'Public-domain features, newest additions to archive.org first',
  homepage: 'https://archive.org',
  license: 'public domain / Creative Commons (filtered on licenseurl)',

  options: {
    since: 'only items made public on or after YYYY-MM-DD',
    ledger: `identifiers already emitted (default ${DEFAULT_LEDGER})`,
    forget: 'ignore and rewrite the ledger, as if this were the first run',
    seen: 'comma-separated seed .sql files whose identifiers to skip too',
    collections: 'archive.org collections (default feature_films)',
    subjects: 'restrict to these subject keywords',
    license: 'pd | cc | any (default pd)',
    'min-year': 'earliest release year',
    'max-year': 'latest release year',
    'min-duration': 'drop anything shorter, in seconds (default 60)',
  },

  categories: CATEGORIES,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Archive metadata fields are a string when single-valued, an array when not. */
const toArray = value =>
  Array.isArray(value)
    ? value
    : value === undefined || value === null
    ? []
    : [value];

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

const baseName = name =>
  name.replace(/(_\d+kb)?(\.ia)?\.mp4$/i, '').toLowerCase();

/**
 * Highest-resolution MP4 derivative, or null. An item holding MP4s with more
 * than one base name is a collection of separate films rather than one title,
 * and there is no single stream URL to represent it.
 */
function pickVideo(files) {
  const candidates = toArray(files)
    .filter(
      f => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.mp4'),
    )
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

function categoryFor(tags) {
  const haystack = tags.join(' ').toLowerCase();
  for (const rule of CATEGORIES) {
    if (rule.match.some(m => haystack.includes(m))) return rule;
  }
  return CATEGORIES.at(-1);
}

const inRange = y => (Number.isInteger(y) && y >= 1888 && y <= 2100 ? y : null);

/**
 * Release year -- never the upload year.
 *
 * Only `metadata.year` is catalogued by hand. Archive's search index
 * SYNTHESISES `year` and `date` from the upload when the uploader left them
 * blank, so `doc.year` on a bare "date: 2026" item comes back 2026 for a 1979
 * kung-fu picture -- and sorting by `publicdate desc` means this source meets
 * exactly those items while they are the newest thing on the site. So the
 * hand-set field and a year in the title ("(1961)") are taken at face value,
 * and every synthesised fallback is dropped when it lands in the same year the
 * item went public. Returns null rather than guess: the column is nullable,
 * and no year beats a wrong one.
 */
function pickYear(item, doc, title) {
  const tagged = inRange(Number(toArray(item.metadata?.year)[0]));
  if (tagged) return tagged;

  const titled = inRange(Number(title.match(/\((1[89]\d{2}|20\d{2})\)/)?.[1]));
  if (titled) return titled;

  const publicYear = Number(
    String(toArray(item.metadata?.publicdate ?? doc.publicdate)[0] ?? '').slice(
      0,
      4,
    ),
  );
  for (const candidate of [doc.year, item.metadata?.date, doc.date]) {
    const year = inRange(
      Number(String(toArray(candidate)[0] ?? '').slice(0, 4)),
    );
    if (year && year !== publicYear) return year;
  }
  return null;
}

const UNSUITABLE_PATTERN =
  /\b(sex|sexy|nude|nudist|nudes|naked|porn|porno|erotic|erotica|xxx|striptease|burlesque|smut|vice|atrocity|atrocities|massacre|lynching|execution|autopsy|concentration camps?|holocaust)\b/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Runs `worker` over `items` with a fixed number of workers in flight. */
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

const readJson = async path => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    // A ledger that is not there yet is the first run, not a failure. A ledger
    // that is there but unreadable is worth saying out loud.
    if (error?.code !== 'ENOENT') {
      throw new Error(`could not read ${path}: ${error.message}`);
    }
    return null;
  }
};

/**
 * Identifiers out of a generated seed file. Both generators write them as a
 * two-space `  -- <identifier>` comment above each row; the file's own header
 * comments start at column zero and so do not match.
 */
const identifiersInSeed = sql =>
  [...sql.matchAll(/^ {2}-- (\S+)/gm)].map(match => match[1]);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function buildQuery(options) {
  const clauses = ['mediatype:(movies)'];
  clauses.push(`collection:(${options.collections.join(' OR ')})`);

  // Quoted because the useful keywords are phrases ("japanese animation"), and
  // an unquoted phrase would be parsed as two independent terms.
  if (options.subjects.length) {
    const terms = options.subjects.map(term => `"${term}"`).join(' OR ');
    clauses.push(`subject:(${terms})`);
  }

  if (options.license === 'pd')
    clauses.push('licenseurl:(*publicdomain* OR *mark\\/1.0*)');
  else if (options.license === 'cc')
    clauses.push('licenseurl:(*creativecommons.org*)');

  if (options.minYear !== null || options.maxYear !== null) {
    clauses.push(
      `year:[${options.minYear ?? 1888} TO ${options.maxYear ?? 2100}]`,
    );
  }

  if (options.since) {
    clauses.push(`publicdate:[${options.since} TO 9999-12-31]`);
  }

  return clauses.join(' AND ');
}

async function search(ctx, query, wanted) {
  const rows = 100;
  const docs = [];
  for (let page = 1; docs.length < wanted; page++) {
    const url = new URL(SEARCH);
    url.searchParams.set('q', query);
    for (const field of [
      'identifier',
      'title',
      'year',
      'date',
      'publicdate',
      'description',
      'subject',
      'licenseurl',
    ]) {
      url.searchParams.append('fl[]', field);
    }
    // The whole point of this source: newest first, not most-downloaded first.
    url.searchParams.append('sort[]', 'publicdate desc');
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('page', String(page));
    url.searchParams.set('output', 'json');

    const body = await ctx.fetchJson(url.toString());
    const batch = body?.response?.docs ?? [];
    docs.push(...batch);
    if (batch.length < rows) break; // last page
  }
  return docs.slice(0, wanted);
}

// ---------------------------------------------------------------------------
// Scrape
// ---------------------------------------------------------------------------

export async function scrape(ctx) {
  const options = {
    collections: ctx.list('collections', ['feature_films']),
    subjects: ctx.list('subjects', []),
    license: ctx.option('license', 'pd'),
    since: ctx.option('since', null),
    minYear: ctx.number('min-year', null),
    maxYear: ctx.number('max-year', null),
    minDurationSeconds: ctx.number('min-duration', 60),
    ledger: ctx.option('ledger', DEFAULT_LEDGER),
    forget: ctx.bool('forget', false),
    seen: ctx.list('seen', []),
    concurrency: ctx.number('concurrency', 6),
  };

  if (!['pd', 'cc', 'any'].includes(options.license)) {
    throw new Error(
      `--license must be pd, cc or any, got "${options.license}"`,
    );
  }
  if (options.since !== null && !DATE.test(options.since)) {
    throw new Error(`--since must be YYYY-MM-DD, got "${options.since}"`);
  }

  // ---- what previous runs already took -----------------------------------

  const ledger = options.forget ? null : await readJson(options.ledger);
  const skip = new Set(toArray(ledger?.identifiers));
  const fromLedger = skip.size;

  for (const path of options.seen) {
    const sql = await readFile(path, 'utf8').catch(error => {
      throw new Error(`--seen: could not read ${path}: ${error.message}`);
    });
    for (const identifier of identifiersInSeed(sql)) skip.add(identifier);
  }

  if (skip.size) {
    ctx.log(
      `  skipping ${skip.size} identifier(s) already taken` +
        `${fromLedger ? ` (${fromLedger} from the ledger)` : ''}`,
    );
  }

  // ---- search ------------------------------------------------------------

  const query = buildQuery(options);
  ctx.log(`  query: ${query}`);
  ctx.log('  sort:  publicdate desc');

  // Over-fetch: items already in the ledger, without an MP4 derivative,
  // without a duration or with an unsuitable title all drop out below.
  const docs = await search(ctx, query, ctx.limit * 6);
  ctx.log(`  ${docs.length} candidate(s)`);

  const fresh = docs.filter(doc => !skip.has(doc.identifier));
  ctx.log(`  ${fresh.length} not seen before`);

  if (!fresh.length) {
    ctx.log(
      '\n  Every candidate has been taken already. Widen the net with a\n' +
        '  larger --limit, other --collections, or start over with --forget.',
    );
    return [];
  }

  // ---- enrich ------------------------------------------------------------

  const enriched = await mapPool(fresh, options.concurrency, async doc => {
    try {
      return {
        doc,
        meta: await ctx.fetchJson(`${METADATA}/${doc.identifier}`),
      };
    } catch {
      return null;
    }
  });

  const items = [];
  const taken = [];

  for (const entry of enriched) {
    if (items.length >= ctx.limit) break;
    if (!entry?.meta?.files) continue;

    const { doc, meta: item } = entry;

    const title = String(
      toArray(item.metadata?.title ?? doc.title)[0] ?? '',
    ).trim();
    if (!title || UNSUITABLE_PATTERN.test(title)) continue;

    const video = pickVideo(item.files);
    if (!video) continue;
    if (video.seconds !== null && video.seconds < options.minDurationSeconds)
      continue;

    const releaseYear = pickYear(item, doc, title);

    const description =
      String(toArray(item.metadata?.description ?? doc.description)[0] ?? '')
        // Archive descriptions are HTML.
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || null;

    const tags = [
      ...toArray(item.metadata?.subject ?? doc.subject),
      ...toArray(item.metadata?.collection),
    ]
      .map(String)
      .flatMap(s => s.split(/[;,]/));

    items.push({
      title,
      description,
      streamUrl: `${DOWNLOAD}/${encodeURIComponent(doc.identifier)}/${video.name
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      posterUrl: `https://archive.org/services/img/${encodeURIComponent(
        doc.identifier,
      )}`,
      releaseYear,
      durationSeconds: video.seconds,
      category: categoryFor(tags).slug,
      // The runner writes this above the row as `  -- <identifier>`, which is
      // what `--seen` reads back out of a generated seed file.
      note: doc.identifier,
    });

    taken.push(doc.identifier);
  }

  // ---- remember ----------------------------------------------------------

  if (taken.length) {
    const identifiers = [...new Set([...skip, ...taken])];
    await writeFile(
      options.ledger,
      `${JSON.stringify(
        { source: ctx.source, updated: new Date().toISOString(), identifiers },
        null,
        2,
      )}\n`,
      'utf8',
    );
    ctx.log(
      `  ledger: ${options.ledger} now holds ${identifiers.length} identifier(s)`,
    );
  }

  return items;
}
