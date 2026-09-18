import type { ContentItem, ContentKind } from '../../types/content';
import {
  homeToRails,
  searchToPager,
  searchToSubjects,
  subjectToContentItem,
} from './adapt';
import type { MovieBoxRail } from './adapt';
import { createMovieBoxClient } from './client';

const HOME_PATH = '/wefeed-mobile-bff/tab-operating?page=1&tabId=2&version=';
const SEARCH_PATH = '/wefeed-mobile-bff/subject-api/search/v2';

const SEARCH_PAGE_SIZE = 20;
const DEFAULT_LIMIT = 40;

/**
 * How many fresh items a single `loadCataloguePage` call aims to return before
 * it stops issuing requests.
 */
const PAGE_TARGET = 24;

/**
 * Upper bound on requests per `loadCataloguePage` call. Keyword search is a
 * title match, so a keyword can legitimately return nothing; the budget lets
 * the feed skip past dud keywords without letting one call run away.
 */
const MAX_REQUESTS_PER_PAGE = 8;

/**
 * Broad title words used to page through the catalogue. The home tab is a
 * fixed payload (see `fetchHomeRails`), so keyword search is the only endpoint
 * that pages, and these seeds are what give the grids their depth.
 */
export const BROAD_KEYWORDS = [
  'the',
  'love',
  'man',
  'war',
  'night',
  'day',
  'life',
  'girl',
  'king',
  'world',
  'last',
  'dark',
  'story',
  'star',
  'dead',
  'game',
  'house',
  'city',
  'time',
  'heart',
  'black',
  'fire',
  'home',
  'road',
  'boy',
  'woman',
  'blood',
  'death',
  'secret',
  'hunter',
  'legend',
  'return',
  'rise',
  'shadow',
  'queen',
  'lost',
  'mission',
  'power',
  'agent',
  'ghost',
  'devil',
  'angel',
  'dream',
  'brother',
  'sister',
  'father',
  'son',
  'wedding',
  'money',
  'crime',
  'police',
  'school',
  'summer',
  'winter',
  'red',
  'blue',
  'white',
  'gold',
  'iron',
  'wild',
  'super',
  'hero',
];

export const ANIME_KEYWORDS = [
  'anime',
  'naruto',
  'one piece',
  'demon slayer',
  'jujutsu kaisen',
  'attack on titan',
  'dragon ball',
  'my hero academia',
];

export const CARTOON_KEYWORDS = [
  'cartoon',
  'tom and jerry',
  'scooby doo',
  'looney tunes',
  'spongebob',
  'peppa pig',
  'paw patrol',
  'doraemon',
];

export const client = createMovieBoxClient();

export interface SearchPage {
  items: ContentItem[];

  hasMore: boolean;
}

export async function searchCataloguePage(
  keyword: string,
  page: number,
  perPage: number = SEARCH_PAGE_SIZE,
): Promise<SearchPage> {
  const payload = await client.post(SEARCH_PATH, {
    keyword,
    page,
    perPage,
    subjectType: 0,
  });

  const items = searchToSubjects(payload).map(subjectToContentItem);
  const pager = searchToPager(payload);

  return {
    items,

    // The server sends a pager and caps `perPage` below what we ask for, so
    // trust `hasMore` when it is there rather than comparing page sizes.
    hasMore: pager === null ? items.length > 0 : pager.hasMore,
  };
}

export async function searchCatalogue(
  keyword: string,
  limit: number = SEARCH_PAGE_SIZE,
): Promise<ContentItem[]> {
  const page = await searchCataloguePage(keyword, 1, limit);
  return page.items.slice(0, limit);
}

function dedupe(items: ContentItem[]): ContentItem[] {
  const seen = new Set<string>();
  const unique: ContentItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    unique.push(item);
  }

  return unique;
}

export async function searchMany(
  keywords: readonly string[],
  limit: number = DEFAULT_LIMIT,
): Promise<ContentItem[]> {
  const settled = await Promise.allSettled(
    keywords.map(keyword => searchCatalogue(keyword)),
  );

  const items: ContentItem[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  return dedupe(items).slice(0, limit);
}

/**
 * Where the feed stopped: which keyword, and which page of that keyword.
 */
export interface CatalogueCursor {
  keywordIndex: number;

  page: number;
}

export interface CataloguePage {
  items: ContentItem[];

  /** Where to resume, or `null` once the keyword list is spent. */
  cursor: CatalogueCursor | null;

  done: boolean;
}

export interface CataloguePageOptions {
  /** Keep only this kind. Omit to keep both movies and series. */
  kind?: ContentKind;

  /** Ids the caller already holds, so a page never repeats them. */
  seen?: ReadonlySet<string>;

  target?: number;
}

export function startCursor(): CatalogueCursor {
  return { keywordIndex: 0, page: 1 };
}

/**
 * Walks the keyword list one page at a time, collecting fresh items until it
 * hits `target` or runs out of keywords. Advances to the next keyword when a
 * keyword reports no further pages.
 */
export async function loadCataloguePage(
  keywords: readonly string[],
  cursor: CatalogueCursor | null,
  options: CataloguePageOptions = {},
): Promise<CataloguePage> {
  const { kind, seen, target = PAGE_TARGET } = options;

  let position = cursor ?? startCursor();

  const collected: ContentItem[] = [];
  const taken = new Set(seen ?? []);

  let lastError: unknown = null;

  for (let request = 0; request < MAX_REQUESTS_PER_PAGE; request += 1) {
    if (position.keywordIndex >= keywords.length) {
      break;
    }

    const keyword = keywords[position.keywordIndex];

    let page: SearchPage;
    try {
      page = await searchCataloguePage(keyword, position.page);
    } catch (error) {
      // One unreachable keyword must not strand the whole feed: note it and
      // move on. It only surfaces if the call collected nothing at all.
      lastError = error;
      position = { keywordIndex: position.keywordIndex + 1, page: 1 };
      continue;
    }

    for (const item of page.items) {
      if (taken.has(item.id)) {
        continue;
      }
      if (kind !== undefined && item.kind !== kind) {
        continue;
      }
      taken.add(item.id);
      collected.push(item);
    }

    position = page.hasMore
      ? { keywordIndex: position.keywordIndex, page: position.page + 1 }
      : { keywordIndex: position.keywordIndex + 1, page: 1 };

    if (collected.length >= target) {
      break;
    }
  }

  if (collected.length === 0 && lastError !== null) {
    throw lastError;
  }

  const exhausted = position.keywordIndex >= keywords.length;

  return {
    items: collected,
    cursor: exhausted ? null : position,
    done: exhausted,
  };
}

export async function fetchHomeRails(): Promise<MovieBoxRail[]> {
  return homeToRails(await client.get(HOME_PATH));
}

/** Words too common or too generic to be worth a keyword page of their own. */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'that',
  'this',
  'into',
  'your',
  'you',
  'his',
  'her',
  'their',
  'season',
  'episode',
  'part',
  'full',
  'movie',
  'film',
  'series',
  'hindi',
  'tamil',
  'telugu',
  'dub',
  'dubbed',
  'audio',
  'multi',
  'english',
]);

const MIN_KEYWORD_LENGTH = 4;

/**
 * Pulls keyword seeds out of titles the catalogue actually returned.
 *
 * Search here matches titles, not genres — a genre word like "action" comes
 * back empty — so seeds taken from real titles are known to match something,
 * where a hand-written list is guesswork.
 */
export function deriveKeywords(
  items: readonly ContentItem[],
  limit = 60,
): string[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const words = item.title.toLowerCase().match(/[a-z]{2,}/g) ?? [];

    // One count per title, so a word repeated in a title does not outrank a
    // word that appears across several.
    for (const word of new Set(words)) {
      if (word.length < MIN_KEYWORD_LENGTH || STOP_WORDS.has(word)) {
        continue;
      }
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([wordA, a], [wordB, b]) => b - a || wordA.localeCompare(wordB))
    .slice(0, limit)
    .map(([word]) => word);
}

let homeRailsOnce: Promise<MovieBoxRail[]> | null = null;

/**
 * The home payload is fixed for the session — `page` is accepted but ignored,
 * every page returning the same body — so it is fetched once and shared by the
 * home rails, the grid seeds and the keyword derivation.
 */
export function homeRailsCached(): Promise<MovieBoxRail[]> {
  if (homeRailsOnce === null) {
    homeRailsOnce = fetchHomeRails().catch((error: unknown) => {
      // Do not cache a failure: the next caller should retry.
      homeRailsOnce = null;
      throw error;
    });
  }

  return homeRailsOnce;
}

/** Drops the cached home payload so a pull-to-refresh really refetches. */
export function clearHomeCache(): void {
  homeRailsOnce = null;
}

export async function trendingCached(): Promise<ContentItem[]> {
  const rails = await homeRailsCached();
  return dedupe(rails.flatMap(rail => rail.items));
}

/**
 * The home tab is a single fixed payload — it does not page — so this is the
 * whole curated set. Pass no limit to take all of it.
 */
export async function fetchTrending(limit?: number): Promise<ContentItem[]> {
  const rails = await fetchHomeRails();
  const items = dedupe(rails.flatMap(rail => rail.items));

  return limit === undefined ? items : items.slice(0, limit);
}

const DETAIL_PATH = '/wefeed-mobile-bff/subject-api/get';
const SEASON_PATH = '/wefeed-mobile-bff/subject-api/season-info';

export async function fetchSubjectDetail(subjectId: string): Promise<unknown> {
  return client.get(`${DETAIL_PATH}?subjectId=${subjectId}`);
}

export async function fetchSeasons(subjectId: string): Promise<unknown> {
  return client.get(`${SEASON_PATH}?subjectId=${subjectId}`);
}
