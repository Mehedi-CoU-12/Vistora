import { readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(HERE, 'sources');

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} */
const argv = new Map();

/** `--key=value` and bare `--flag` into the map. Later calls win. */
function addFlags(tokens) {
  for (const token of tokens) {
    if (!token.startsWith('--')) continue;
    const [key, value = 'true'] = token.slice(2).split('=');
    if (key) argv.set(key, value);
  }
}

/** Splits a flag STRING the way a shell would, honouring quotes. */
const splitFlags = raw =>
  (raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(token =>
    token.replace(/^(['"])([\s\S]*)\1$/, '$2'),
  );

addFlags(process.argv.slice(2));

if (process.env.SCRAPE_OPTIONS)
  addFlags(splitFlags(process.env.SCRAPE_OPTIONS));

const text = (key, fallback) => argv.get(key) ?? fallback;

const number = (key, fallback) => {
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed))
    throw new Error(`--${key} must be a number, got "${raw}"`);
  return parsed;
};

/** `--probe` / `--probe=false` / `--no-probe` all mean what they look like. */
const bool = (key, fallback) => {
  if (argv.has(`no-${key}`)) return false;
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  return raw !== 'false' && raw !== '0';
};

const list = (key, fallback) => {
  const raw = argv.get(key);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Leading underscore means "not a source": `_template.mjs` is there to copy. */
async function listSources() {
  const entries = await readdir(SOURCES_DIR);
  return entries
    .filter(name => name.endsWith('.mjs') && !name.startsWith('_'))
    .map(name => name.slice(0, -'.mjs'.length))
    .sort();
}

const loadSource = name =>
  import(pathToFileURL(join(SOURCES_DIR, `${name}.mjs`)).href);

if (argv.has('list')) {
  const names = await listSources();
  console.log(`${names.length} source(s) in scripts/sources:\n`);
  for (const name of names) {
    const { meta } = await loadSource(name);
    console.log(`  ${name}`);
    if (meta?.description) console.log(`      ${meta.description}`);
    if (meta?.homepage) console.log(`      site:    ${meta.homepage}`);
    if (meta?.license) console.log(`      licence: ${meta.license}`);
    for (const [flag, help] of Object.entries(meta?.options ?? {})) {
      console.log(`      --${flag.padEnd(16)} ${help}`);
    }
    console.log('');
  }
  process.exit(0);
}

const SOURCE_NAME = /^[a-z0-9][a-z0-9-]*$/;

const sourceName = text('source', 'test-videos');
if (!SOURCE_NAME.test(sourceName)) {
  throw new Error(
    `--source must be lowercase letters, digits and dashes; got "${sourceName}"`,
  );
}

const source = await loadSource(sourceName).catch(async error => {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  const names = await listSources();
  throw new Error(
    `no source named "${sourceName}" in scripts/sources.\n` +
      `Available: ${names.join(', ') || '(none)'}\n` +
      'Add one by copying scripts/sources/_template.mjs.',
  );
});

if (typeof source.scrape !== 'function') {
  throw new Error(`scripts/sources/${sourceName}.mjs must export "scrape"`);
}

const meta = source.meta ?? {};

const options = {
  limit: number('limit', 40),
  out: text('out', `supabase/seed_scrape_${sourceName}.sql`),
  probe: bool('probe', true),
  timeoutMs: number('timeout', 20000),
  delayMs: number('delay', 250),
  retries: number('retries', 2),
  concurrency: number('concurrency', 6),
};

if (!Number.isInteger(options.limit) || options.limit < 1) {
  throw new Error(
    `--limit must be a positive whole number, got "${options.limit}"`,
  );
}

// ---------------------------------------------------------------------------
// Schema facts
//
// Mirrored from supabase/migrations. The point of duplicating them is to fail
// HERE, with the title that caused it, rather than three steps later inside
// psql with a constraint name and no context.
// ---------------------------------------------------------------------------

/** `public.slug`: lowercase alphanumeric groups joined by single dashes. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `public.http_url`: absolute http(s), no whitespace. */
const HTTP_URL = /^https?:\/\/[^\s]+$/;
/** `public.stream_protocol`, plus 'youtube' from migration 0004. */
const PROTOCOLS = new Set(['hls', 'dash', 'mp4', 'youtube', 'other']);
/** `public.category_kind`, plus 'anime' from migration 0002. */
const CATEGORY_KINDS = new Set([
  'live_tv',
  'movie',
  'sports',
  'cartoon',
  'anime',
  'other',
]);

const categories = (meta.categories ?? []).map((category, index) => ({
  slug: category.slug,
  name: category.name,
  kind: category.kind ?? 'movie',
  sort: category.sort ?? (index + 1) * 10,
}));

if (!categories.length) {
  throw new Error(
    `scripts/sources/${sourceName}.mjs must export meta.categories with at least one ` +
      '{slug, name, kind} -- every movie row needs a category to land in.',
  );
}

for (const category of categories) {
  if (!SLUG.test(category.slug ?? '')) {
    throw new Error(`meta.categories: "${category.slug}" is not a valid slug`);
  }
  if (!CATEGORY_KINDS.has(category.kind)) {
    throw new Error(
      `meta.categories: kind "${category.kind}" is not a public.category_kind ` +
        `(${[...CATEGORY_KINDS].join(', ')})`,
    );
  }
}

const categoryBySlug = new Map(
  categories.map(category => [category.slug, category]),
);
const defaultCategory = categories[0];

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Vistora-scraper/1.0 (+https://github.com/Mehedi-CoU-12/Vistora)';


let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + options.delayMs;
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
}

async function request(url, init = {}) {
  let lastError;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        ...init,
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      });
      if (!response.ok) {
        // A 404 or a 403 is the site's answer, not a hiccup. Retrying it only
        // spends its bandwidth to be told the same thing. 429 and 5xx are the
        // ones where waiting genuinely helps.
        const retriable = response.status === 429 || response.status >= 500;
        throw Object.assign(new Error(`HTTP ${response.status} for ${url}`), {
          fatal: !retriable,
        });
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error?.fatal || attempt === options.retries) break;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const fetchText = async (url, init) => (await request(url, init)).text();

const fetchJson = async (url, init) =>
  (
    await request(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
  ).json();

/**
 * A stream URL that 404s imports just as cleanly as one that plays, and you
 * only find out on the television. One ranged byte proves the file is served
 * without pulling a feature film through the runner.
 */
async function isPlayable(url, protocol = protocolFor(url)) {
  // A youtube.com/watch URL serves an HTML page, so a ranged GET proves only
  // that the page exists -- it says nothing about the video behind it. oEmbed
  // does: 200 while the video is public, a 4xx once it has been removed, made
  // private or pulled everywhere, which is the rot this probe is here to catch.
  if (protocol === 'youtube') {
    const endpoint =
      'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent(url);
    try {
      await request(endpoint);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const response = await request(url, { headers: { Range: 'bytes=0-0' } });
    const type = (response.headers.get('content-type') ?? '').toLowerCase();
    // Manifests are text; the media they point at is not fetched here.
    if (/\.(m3u8|mpd)(\?|$)/i.test(url)) return true;
    return (
      type.startsWith('video/') || type.startsWith('application/octet-stream')
    );
  } catch {
    return false;
  }
}

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


const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(value) {
  return String(value).replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, entity) => {
      const key = entity.toLowerCase();
      if (key.startsWith('#x')) {
        const code = parseInt(key.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      if (key.startsWith('#')) {
        const code = Number(key.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[key] ?? whole;
    },
  );
}

/** Markup in, readable one-line text out. */
const stripTags = html =>
  decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

/** First capture group of `pattern`, or null. */
function first(html, pattern, group = 1) {
  const match = String(html ?? '').match(pattern);
  return match ? match[group] ?? null : null;
}

/** Every capture group of a /g pattern, in document order. */
function all(html, pattern, group = 1) {
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  return [...String(html ?? '').matchAll(new RegExp(pattern.source, flags))]
    .map(match => match[group])
    .filter(value => value !== undefined);
}

/** `<meta name=... content=...>` or `<meta property="og:..." content=...>`. */
function metaTag(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']` +
      `|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["']`,
    'i',
  );
  const match = String(html ?? '').match(pattern);
  const value = match ? match[1] ?? match[2] : null;
  return value ? decodeEntities(value).trim() : null;
}

/** Resolves `href` against `base`, or null if it is not a usable URL. */
function absolute(href, base) {
  try {
    return new URL(decodeEntities(String(href).trim()), base).toString();
  } catch {
    return null;
  }
}

/** Every `<a>` as `{href, text}`, hrefs already absolute. */
function links(html, base) {
  return [
    ...String(html ?? '').matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ]
    .map(match => ({
      href: absolute(match[1], base),
      text: stripTags(match[2]),
    }))
    .filter(link => link.href);
}

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

function toSlug(...parts) {
  const base = parts
    .filter(part => part !== null && part !== undefined && part !== '')
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : null;
}


function protocolFor(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'other';
  }
  const path = parsed.pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (/\.(mp4|m4v|mov|webm|mkv)$/.test(path)) return 'mp4';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(parsed.hostname)) return 'youtube';
  return 'other';
}

const optionalUrl = value =>
  typeof value === 'string' && HTTP_URL.test(value) ? value : null;

const clean = (value, max) => {
  const trimmed = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const integerIn = (value, min, max) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

/**
 * One scraped item to one `public.movies` row, or a reason it cannot be.
 * @returns {{row: object} | {reason: string, subject: string}}
 */
function toRow(item) {
  const subject =
    clean(item?.title, 120) ??
    String(item?.streamUrl ?? '(no title)').slice(0, 120);

  const title = clean(item?.title, 200);
  if (!title) return { reason: 'no title', subject };

  const streamUrl =
    typeof item?.streamUrl === 'string' ? item.streamUrl.trim() : '';
  if (!streamUrl) return { reason: 'no stream URL', subject };
  if (!HTTP_URL.test(streamUrl))
    return { reason: 'stream URL is not absolute http(s)', subject };

  const releaseYear =
    item?.releaseYear == null ? null : integerIn(item.releaseYear, 1888, 2100);
  const slug = item?.slug ?? toSlug(title, releaseYear);
  if (!slug || !SLUG.test(slug) || slug.length > 80) {
    return { reason: 'title does not reduce to a valid slug', subject };
  }

  const protocol = item?.protocol ?? protocolFor(streamUrl);
  if (!PROTOCOLS.has(protocol)) {
    return {
      reason: `protocol "${protocol}" is not a public.stream_protocol`,
      subject,
    };
  }

  const categorySlug = item?.category ?? defaultCategory.slug;
  const category = categoryBySlug.get(categorySlug);
  if (!category) {
    return {
      reason: `category "${categorySlug}" is not declared in meta.categories`,
      subject,
    };
  }

  return {
    row: {
      slug,
      title,
      description: clean(item?.description, 1000),
      // Nullable columns, so a bad URL loses the image rather than the title.
      posterUrl: optionalUrl(item?.posterUrl),
      backdropUrl: optionalUrl(item?.backdropUrl),
      streamUrl,
      protocol,
      releaseYear,
      durationSeconds:
        item?.durationSeconds == null
          ? null
          : integerIn(item.durationSeconds, 1, 86400),
      category,
      note: clean(item?.note, 160),
    },
  };
}

const sqlText = value =>
  value === null || value === undefined
    ? 'null'
    : `'${String(value).replace(/'/g, "''")}'`;

const sqlNumber = value =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'null'
    : String(Math.round(value));

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const log = (...args) => console.log(...args);

console.log(
  `source:  ${sourceName}${meta.homepage ? `  (${meta.homepage})` : ''}`,
);
if (meta.description) console.log(`         ${meta.description}`);
console.log(`limit:   ${options.limit}`);

const scraped = await source.scrape({
  limit: options.limit,
  source: sourceName,

  // Options. The runner's own flags are here too, so a source can respect
  // `--limit` or read one of its own with the same call.
  option: text,
  number,
  bool,
  list,
  has: key => argv.has(key),

  // Network. Throttled, retried and User-Agent'd for you.
  fetchText,
  fetchJson,
  request,

  html: {
    first,
    all,
    text: stripTags,
    links,
    metaTag,
    absolute,
    decodeEntities,
  },

  toSlug,
  log,
});

const items = Array.isArray(scraped) ? scraped : [];
console.log(`\n${items.length} item(s) scraped`);

/** @type {Map<string, {count: number, example: string}>} */
const rejected = new Map();
const reject = (reason, subject) => {
  const entry = rejected.get(reason) ?? { count: 0, example: subject };
  entry.count += 1;
  rejected.set(reason, entry);
};

const rows = [];
const seenSlugs = new Set();
const seenTitles = new Set();

for (const item of items) {
  const result = toRow(item);
  if ('reason' in result) {
    reject(result.reason, result.subject);
    continue;
  }
  const { row } = result;

  if (seenSlugs.has(row.slug)) {
    reject('duplicate slug', row.title);
    continue;
  }
  // Sites list the same title under several routes. One card per title.
  const titleKey = row.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (seenTitles.has(titleKey)) {
    reject('duplicate title', row.title);
    continue;
  }

  seenSlugs.add(row.slug);
  seenTitles.add(titleKey);
  rows.push(row);
  if (rows.length >= options.limit) break;
}

if (rejected.size) {
  console.log('\ndropped:');
  for (const [reason, { count, example }] of rejected) {
    console.log(`  ${String(count).padStart(4)}  ${reason}  (e.g. ${example})`);
  }
}

let final = rows;
if (options.probe) {
  console.log(
    `\nprobing ${final.length} stream(s) with ${options.concurrency} in flight...`,
  );
  const verdicts = await mapPool(final, options.concurrency, row =>
    isPlayable(row.streamUrl, row.protocol),
  );
  const dead = final.filter((_, index) => !verdicts[index]);
  for (const row of dead)
    console.log(`  dead: ${row.title} -- ${row.streamUrl}`);
  final = final.filter((_, index) => verdicts[index]);
  console.log(`playable: ${final.length} / ${verdicts.length}`);
}

if (!final.length) {
  console.error('\nnothing to import -- refusing to write an empty seed file');
  console.error(
    'If the site changed its markup the selectors in ' +
      `scripts/sources/${sourceName}.mjs are what to look at first; ` +
      'the "dropped" list above says which field stopped being found.',
  );
  process.exit(1);
}

final.sort(
  (a, b) => a.category.sort - b.category.sort || a.title.localeCompare(b.title),
);

const usedCategories = categories.filter(category =>
  final.some(row => row.category.slug === category.slug),
);

const sql = `-- Generated by scripts/scrape.mjs --source=${sourceName} on ${new Date()
  .toISOString()
  .slice(0, 10)}
-- Site:    ${meta.homepage ?? '(not declared)'}
-- Licence: ${
  meta.license ?? '(not declared -- check before publishing these rows)'
}
-- Streams: ${
  options.probe ? 'probed, each answered a ranged GET' : 'NOT probed'
}
--
-- Upserts keyed on slug: re-running refreshes these rows rather than
-- duplicating them, which matters because scraped stream URLs rot. Nothing is
-- ever deleted. The whole file is one transaction.

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

insert into public.movies
  (slug, title, description, poster_url, backdrop_url, stream_url, stream_protocol,
   release_year, duration_seconds, category_id, sort_order)
values
${final
  .map(
    (row, index) =>
      (row.note ? `  -- ${row.note}\n` : '') +
      `  (${sqlText(row.slug)}, ${sqlText(row.title)}, ${sqlText(
        row.description,
      )},\n` +
      `   ${sqlText(row.posterUrl)}, ${sqlText(row.backdropUrl)},\n` +
      `   ${sqlText(row.streamUrl)}, '${row.protocol}',\n` +
      `   ${sqlNumber(row.releaseYear)}, ${sqlNumber(row.durationSeconds)},\n` +
      `   (select id from public.categories where slug = ${sqlText(
        row.category.slug,
      )}), ${(index + 1) * 10})`,
  )
  .join(',\n')}
on conflict (slug) do update
  set title = excluded.title,
      description = excluded.description,
      poster_url = excluded.poster_url,
      backdrop_url = excluded.backdrop_url,
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
  `  ${final.length} title(s), ${usedCategories.length} category/ies`,
);
console.log(`\nreview it, then:  psql "$DATABASE_URL" -f ${options.out}`);
