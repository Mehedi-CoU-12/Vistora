import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';
import {
  playInfoToCandidates,
  matchKey,
  searchToSubjects,
} from '../moviebox/adapt';
import type { MovieBoxSubject } from '../moviebox/adapt';
import { createMovieBoxClient } from '../moviebox/client';

const SEARCH_PATH = '/wefeed-mobile-bff/subject-api/search/v2';
const PLAY_INFO_PATH = '/wefeed-mobile-bff/subject-api/play-info/v2';

const SUBJECT_TYPE_MOVIE = 1;
const SUBJECT_TYPE_SERIES = 2;

const client = createMovieBoxClient();

const subjectIdCache = new Map<string, string | null>();

function searchTitleFor(item: ContentItem): string {
  return item.kind === 'episode' && item.seriesTitle !== undefined
    ? item.seriesTitle
    : item.title;
}

function wantedSubjectType(item: ContentItem): number {
  return item.kind === 'series' || item.kind === 'episode'
    ? SUBJECT_TYPE_SERIES
    : SUBJECT_TYPE_MOVIE;
}

export function selectSubject(
  subjects: MovieBoxSubject[],
  title: string,
  subjectType: number,
  year?: number,
): MovieBoxSubject | null {
  const ofKind = subjects.filter(
    subject => subject.subjectType === subjectType,
  );
  const pool = ofKind.length > 0 ? ofKind : subjects;
  if (pool.length === 0) {
    return null;
  }

  const key = matchKey(title);
  const exact = pool.filter(subject => matchKey(subject.title) === key);

  if (exact.length > 0) {
    if (year !== undefined) {
      const sameYear = exact.find(subject => subject.releaseYear === year);
      if (sameYear !== undefined) {
        return sameYear;
      }
    }
    return exact[0];
  }

  return pool[0];
}

async function findSubjectId(item: ContentItem): Promise<string | null> {
  if (item.movieboxSubjectId !== undefined) {
    return item.movieboxSubjectId;
  }

  const cached = subjectIdCache.get(item.id);
  if (cached !== undefined) {
    return cached;
  }

  const title = searchTitleFor(item);

  const payload = await client.post(SEARCH_PATH, {
    keyword: title,
    page: 1,
    perPage: 15,
    subjectType: 0,
  });

  const subject = selectSubject(
    searchToSubjects(payload),
    title,
    wantedSubjectType(item),
    item.meta?.year,
  );

  const subjectId = subject?.subjectId ?? null;
  subjectIdCache.set(item.id, subjectId);
  return subjectId;
}

function playInfoPath(item: ContentItem, subjectId: string): string {
  const season = item.season ?? 0;
  const episode = item.episodeNumber ?? 0;

  if (season > 0 && episode > 0) {
    return `${PLAY_INFO_PATH}?subjectId=${subjectId}&se=${season}&ep=${episode}`;
  }

  return `${PLAY_INFO_PATH}?subjectId=${subjectId}`;
}

export const movieboxStreamSource: StreamSource = {
  id: 'moviebox',

  canResolve: (item: ContentItem) =>
    item.stream === null && item.kind !== 'channel',

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    try {
      const subjectId = await findSubjectId(item);

      if (subjectId === null) {
        return [];
      }

      const playInfo = await client.get(playInfoPath(item, subjectId));
      return playInfoToCandidates(playInfo, client.userAgent());
    } catch (error) {
      console.debug(
        '[movieboxStream] Could not resolve:',
        item.title,
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  },

  ttlMs: 5 * 60 * 1000,
};
