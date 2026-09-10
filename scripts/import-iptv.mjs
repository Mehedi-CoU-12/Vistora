#!/usr/bin/env node
// @ts-check
/**
 * Imports free-to-air live channels from the iptv-org catalogue into a SQL seed
 * file for `public.channels`.
 *
 * ---------------------------------------------------------------------------
 * Where the data comes from
 * ---------------------------------------------------------------------------
 * https://iptv-org.github.io/api/ -- an open, community-maintained INDEX of
 * publicly reachable stream URLs. It stores no video and hosts no channel: it
 * is a list of links, which is exactly what this project needs, because Vistora
 * hands a URL to the device and never touches the bytes (see README, "The one
 * architectural rule").
 *
 * ---------------------------------------------------------------------------
 * What this script deliberately refuses to import
 * ---------------------------------------------------------------------------
 * iptv-org publishes a `blocklist.json` of channels removed after a rights
 * holder complained (`dmca`) or for adult content (`nsfw`). Both are filtered
 * out here with no flag to turn that off -- a takedown that is honoured
 * upstream but ignored downstream is not honoured at all.
 *
 * That blocklist is a floor, not a guarantee. An open HLS URL for a channel
 * that is normally sold as part of a pay-TV package is very likely an
 * unauthorised restream even when nobody has filed a complaint yet, and such a
 * link is also the first to die. `--official-only` keeps just the channels
 * whose stream is published by the broadcaster itself.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   node scripts/import-iptv.mjs                        # BD + Bengali, probed
 *   node scripts/import-iptv.mjs --countries=BD,IN,PK
 *   node scripts/import-iptv.mjs --languages=ben,hin,eng
 *   node scripts/import-iptv.mjs --categories=news,sports,kids
 *   node scripts/import-iptv.mjs --official-only        # broadcaster-run only
 *   node scripts/import-iptv.mjs --no-probe             # skip the liveness check
 *   node scripts/import-iptv.mjs --out=supabase/seed_iptv.sql
 *
 * Then review the file and apply it:
 *   psql "$DATABASE_URL" -f supabase/seed_iptv.sql
 */
import {writeFile} from 'node:fs/promises';

const API = 'https://iptv-org.github.io/api';

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
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
};

const options = {
  countries: list('countries', ['bd']).map(c => c.toUpperCase()),
  languages: list('languages', ['ben']),
  categories: list('categories', null),
  officialOnly: argv.get('official-only') === 'true',
  /**
   * Release builds ship `usesCleartextTraffic="false"` (set by the React Native
   * gradle plugin, not by us), so an `http://` stream that plays in debug fails
   * with a bare network error in the APK you actually distribute. Importing one
   * is importing a channel that is broken for every real user.
   */
  allowHttp: argv.get('allow-http') === 'true',
  probe: argv.get('no-probe') !== 'true',
  concurrency: Number(argv.get('concurrency') ?? 24),
  timeoutMs: Number(argv.get('timeout') ?? 12_000),
  out: argv.get('out') ?? 'supabase/seed_iptv.sql',
};

// ---------------------------------------------------------------------------
// iptv-org category -> Vistora category
// ---------------------------------------------------------------------------
// `channels.category_id` holds exactly one category, but an iptv-org channel
// carries a list, so the FIRST match in this order wins. Sports and news sit
// above entertainment on purpose: "Sony Sports Ten" is tagged both, and a
// viewer looking for sport should find it under Sports.

const CATEGORY_RULES = [
  {slug: 'news', name: 'News', sort: 10, match: ['news', 'weather', 'legislative']},
  {slug: 'sports-tv', name: 'Sports Channels', sort: 30, match: ['sports', 'outdoor']},
  {slug: 'kids-tv', name: 'Kids & Cartoons', sort: 40, match: ['kids', 'animation']},
  {slug: 'movies-tv', name: 'Movies', sort: 50, match: ['movies', 'classic']},
  {slug: 'music-tv', name: 'Music', sort: 60, match: ['music']},
  {slug: 'religious-tv', name: 'Religious', sort: 70, match: ['religious']},
  {slug: 'knowledge-tv', name: 'Knowledge', sort: 80, match: ['documentary', 'education', 'science', 'business']},
  {slug: 'entertainment', name: 'Entertainment', sort: 20, match: ['entertainment', 'series', 'comedy', 'family', 'culture']},
  {slug: 'lifestyle-tv', name: 'Lifestyle', sort: 90, match: ['lifestyle', 'cooking', 'travel', 'relax', 'auto']},
  {slug: 'general-tv', name: 'General', sort: 100, match: ['general', 'public', 'interactive', 'shop']},
];

function categoryFor(channelCategories) {
  for (const rule of CATEGORY_RULES) {
    if (channelCategories.some(c => rule.match.includes(c))) return rule;
  }
  return CATEGORY_RULES.at(-1); // general-tv
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJson(name) {
  const response = await fetch(`${API}/${name}.json`);
  if (!response.ok) throw new Error(`${name}.json -> HTTP ${response.status}`);
  return response.json();
}

/** Must satisfy the `public.slug` domain: ^[a-z0-9]+(?:-[a-z0-9]+)*$, 2..80. */
function toSlug(name, suffix) {
  const base = `${name}-${suffix}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : `channel-${suffix}`.toLowerCase();
}

/** Must satisfy the `public.http_url` domain: absolute http(s), no whitespace. */
function isUsableUrl(url, {allowHttp}) {
  if (typeof url !== 'string' || /\s/.test(url)) return false;
  if (!/^https?:\/\/\S+$/i.test(url)) return false;
  return allowHttp || url.toLowerCase().startsWith('https://');
}

function protocolFor(url) {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.m3u8') || path.includes('.m3u8')) return 'hls';
  if (path.endsWith('.mpd')) return 'dash';
  if (path.endsWith('.mp4')) return 'mp4';
  return 'other';
}

const sqlText = value =>
  value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`;

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

/**
 * A stream counts as alive only if it answers 200 AND the body looks like a
 * real manifest. Many dead hosts answer 200 with an HTML "channel offline"
 * page, so checking the status code alone imports channels that never play.
 */
async function isAlive(entry) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(entry.stream_url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          entry.headers?.['User-Agent'] ??
          'Mozilla/5.0 (Linux; Android 14; TV) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        ...(entry.headers?.Referer ? {Referer: entry.headers.Referer} : {}),
      },
    });
    if (!response.ok) return false;
    const body = (await response.text()).slice(0, 200_000);
    return body.includes('#EXTM3U') || body.includes('<MPD');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [channels, feeds, streams, logos, blocklist] = await Promise.all(
  ['channels', 'feeds', 'streams', 'logos', 'blocklist'].map(getJson),
);

const blocked = new Set(blocklist.map(b => b.channel));
const byId = new Map(channels.map(c => [c.id, c]));

const languagesById = new Map();
for (const feed of feeds) {
  const set = languagesById.get(feed.channel) ?? new Set();
  for (const language of feed.languages ?? []) set.add(language);
  languagesById.set(feed.channel, set);
}

// Best logo per channel: one that is actually in use, https, and not enormous.
const logoById = new Map();
for (const logo of logos) {
  if (!logo.in_use || !isUsableUrl(logo.url, {allowHttp: false})) continue;
  const current = logoById.get(logo.channel);
  if (!current || (logo.width ?? 0) > (current.width ?? 0)) logoById.set(logo.channel, logo);
}

const wanted = [];
const seenSlugs = new Set();

for (const stream of streams) {
  const channel = stream.channel ? byId.get(stream.channel) : null;
  if (!channel) continue;                                   // unidentified stream
  if (blocked.has(channel.id) || channel.is_nsfw) continue;  // dmca / nsfw
  if (channel.closed) continue;                             // channel is gone
  if (!isUsableUrl(stream.url, options)) continue;

  const languages = languagesById.get(channel.id) ?? new Set();
  const matchesCountry = options.countries.includes(channel.country);
  const matchesLanguage = options.languages.some(l => languages.has(l));
  if (!matchesCountry && !matchesLanguage) continue;

  if (options.categories && !channel.categories.some(c => options.categories.includes(c))) {
    continue;
  }

  // "Official" = the broadcaster serves the stream from its own domain. Cheap
  // to compute and a good proxy for "this link is authorised and will survive".
  const streamHost = new URL(stream.url).hostname.replace(/^www\./, '');
  const siteHost = channel.website ? new URL(channel.website).hostname.replace(/^www\./, '') : null;
  const registrable = h => h?.split('.').slice(-2).join('.');
  const isOfficial = Boolean(siteHost) && registrable(streamHost) === registrable(siteHost);
  if (options.officialOnly && !isOfficial) continue;

  // One row per channel: the first stream wins, so a channel with three mirrors
  // does not become three identical cards in the grid.
  const slug = toSlug(channel.name, channel.country);
  if (seenSlugs.has(slug)) continue;
  seenSlugs.add(slug);

  const headers = {};
  if (stream.user_agent) headers['User-Agent'] = stream.user_agent;
  if (stream.referrer) headers.Referer = stream.referrer;

  const logo = logoById.get(channel.id);
  const description = [channel.country, [...languages].join('/'), stream.quality]
    .filter(Boolean)
    .join(' · ');

  wanted.push({
    slug,
    name: channel.name,
    description: description || null,
    logo_url: logo?.url ?? null,
    stream_url: stream.url,
    stream_protocol: protocolFor(stream.url),
    headers: Object.keys(headers).length ? headers : null,
    category: categoryFor(channel.categories),
    isOfficial,
  });
}

console.log(`matched ${wanted.length} channels (blocklist + nsfw already removed)`);

let rows = wanted;
if (options.probe) {
  console.log(`probing ${rows.length} streams with ${options.concurrency} in flight...`);
  const verdicts = await mapPool(rows, options.concurrency, isAlive);
  rows = rows.filter((_, i) => verdicts[i]);
  console.log(`alive: ${rows.length} / ${verdicts.length}`);
}

rows.sort((a, b) => a.category.sort - b.category.sort || a.name.localeCompare(b.name));

const usedCategories = CATEGORY_RULES.filter(rule => rows.some(r => r.category.slug === rule.slug));

const sql = `-- Generated by scripts/import-iptv.mjs on ${new Date().toISOString().slice(0, 10)}
-- Source: https://iptv-org.github.io/api/ (index of publicly reachable streams)
-- Filters: countries=${options.countries.join(',') || '-'} languages=${options.languages.join(',') || '-'}${
  options.officialOnly ? ' official-only' : ''
}${options.probe ? ' probed=alive' : ' unprobed'}
--
-- Channels on the upstream dmca/nsfw blocklist are never emitted.
-- Re-run the script to refresh: live stream URLs rot, typically within months.

begin;

insert into public.categories (slug, name, kind, sort_order) values
${usedCategories.map(c => `  (${sqlText(c.slug)}, ${sqlText(c.name)}, 'live_tv', ${c.sort})`).join(',\n')}
on conflict (slug) do update
  set name = excluded.name,
      kind = excluded.kind,
      sort_order = excluded.sort_order;

insert into public.channels
  (slug, name, description, logo_url, stream_url, stream_protocol, stream_headers, category_id, sort_order)
values
${rows
  .map(
    (r, i) =>
      `  (${sqlText(r.slug)}, ${sqlText(r.name)}, ${sqlText(r.description)}, ${sqlText(r.logo_url)},\n` +
      `   ${sqlText(r.stream_url)}, '${r.stream_protocol}', ${
        r.headers ? `${sqlText(JSON.stringify(r.headers))}::jsonb` : 'null'
      },\n` +
      `   (select id from public.categories where slug = ${sqlText(r.category.slug)}), ${(i + 1) * 10})`,
  )
  .join(',\n')}
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      logo_url = excluded.logo_url,
      stream_url = excluded.stream_url,
      stream_protocol = excluded.stream_protocol,
      stream_headers = excluded.stream_headers,
      category_id = excluded.category_id,
      sort_order = excluded.sort_order,
      is_active = true;

commit;
`;

await writeFile(options.out, sql, 'utf8');

const official = rows.filter(r => r.isOfficial).length;
console.log(`\nwrote ${options.out}`);
console.log(`  ${rows.length} channels, ${usedCategories.length} categories`);
console.log(`  ${official} served from the broadcaster's own domain, ${rows.length - official} from third-party hosts`);
console.log(`\nreview it, then:  psql "$DATABASE_URL" -f ${options.out}`);
