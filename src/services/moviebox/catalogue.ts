import type { ContentItem } from '../../types/content';
import {
  homeToRails,
  searchToSubjects,
  subjectToContentItem,
} from './adapt';
import type { MovieBoxRail } from './adapt';
import { createMovieBoxClient } from './client';

const HOME_PATH = '/wefeed-mobile-bff/tab-operating?page=1&tabId=2&version=';
const SEARCH_PATH = '/wefeed-mobile-bff/subject-api/search/v2';

const SEARCH_PAGE_SIZE = 20;
const DEFAULT_LIMIT = 40;

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

export async function searchCatalogue(
  keyword: string,
  limit: number = SEARCH_PAGE_SIZE,
): Promise<ContentItem[]> {
  const payload = await client.post(SEARCH_PATH, {
    keyword,
    page: 1,
    perPage: limit,
    subjectType: 0,
  });

  return searchToSubjects(payload).map(subjectToContentItem);
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

export async function fetchHomeRails(): Promise<MovieBoxRail[]> {
  return homeToRails(await client.get(HOME_PATH));
}

export async function fetchTrending(
  limit: number = DEFAULT_LIMIT,
): Promise<ContentItem[]> {
  const rails = await fetchHomeRails();
  return dedupe(rails.flatMap(rail => rail.items)).slice(0, limit);
}

const DETAIL_PATH = '/wefeed-mobile-bff/subject-api/get';
const SEASON_PATH = '/wefeed-mobile-bff/subject-api/season-info';

export async function fetchSubjectDetail(subjectId: string): Promise<unknown> {
  return client.get(`${DETAIL_PATH}?subjectId=${subjectId}`);
}

export async function fetchSeasons(subjectId: string): Promise<unknown> {
  return client.get(`${SEASON_PATH}?subjectId=${subjectId}`);
}
