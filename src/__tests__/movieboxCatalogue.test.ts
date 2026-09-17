import {
  detailBackdrop,
  detailToSubject,
  episodeItem,
  homeToRails,
  seasonsFromPayload,
  subjectToContentItem,
} from '../services/moviebox/adapt';
import type { MovieBoxSubject } from '../services/moviebox/adapt';

const subject: MovieBoxSubject = {
  subjectId: '8826677989518759008',
  title: 'Awarapan 2 [Hindi][CAM]',
  subjectType: 1,
  releaseYear: 2026,
  imageUrl: 'https://pbcdn.aoneroom.com/image/cover.jpg',
  description: 'A film.',
  genre: 'Romance',
  rating: '6.5',
  durationSeconds: 7200,
};

describe('subjectToContentItem', () => {
  it('maps a movie subject onto a content item', () => {
    const item = subjectToContentItem(subject);

    expect(item.id).toBe('8826677989518759008');
    expect(item.kind).toBe('movie');
    expect(item.title).toBe('Awarapan 2');
    expect(item.imageUrl).toBe('https://pbcdn.aoneroom.com/image/cover.jpg');
    expect(item.stream).toBeNull();
    expect(item.movieboxSubjectId).toBe('8826677989518759008');
    expect(item.meta).toEqual({
      year: 2026,
      genre: 'Romance',
      rating: '6.5',
      duration: '2h 0m',
    });
  });

  it('maps subjectType 2 to a series', () => {
    expect(subjectToContentItem({ ...subject, subjectType: 2 }).kind).toBe(
      'series',
    );
  });

  it('leaves duration undefined when the api reports zero', () => {
    expect(
      subjectToContentItem({ ...subject, durationSeconds: null }).meta?.duration,
    ).toBeUndefined();
  });

  it('carries no stream so the stream source resolves it', () => {
    expect(subjectToContentItem(subject).stream).toBeNull();
  });
});

describe('homeToRails', () => {
  const payload = {
    tabId: 2,
    items: [
      { title: 'Banner', subjects: [] },
      {
        title: '💗Bollywood Love Stories',
        subjects: [
          { subjectId: '1', title: 'One', subjectType: 1, cover: { url: 'https://c/1.jpg' } },
          { subjectId: '2', title: 'Two', subjectType: 2, cover: { url: 'https://c/2.jpg' } },
        ],
      },
      { title: 'Categories', subjects: [] },
    ],
  };

  it('keeps only rails that have subjects', () => {
    const rails = homeToRails(payload);

    expect(rails).toHaveLength(1);
    expect(rails[0].title).toBe('💗Bollywood Love Stories');
    expect(rails[0].items).toHaveLength(2);
    expect(rails[0].items[0].id).toBe('1');
    expect(rails[0].items[1].kind).toBe('series');
  });

  it('returns nothing for a malformed payload', () => {
    expect(homeToRails(null)).toEqual([]);
    expect(homeToRails({})).toEqual([]);
    expect(homeToRails({ items: 'nope' })).toEqual([]);
  });
});

describe('seasonsFromPayload', () => {
  it('reads season numbers and episode counts', () => {
    expect(
      seasonsFromPayload({
        subjectId: '1382465867459478920',
        seasons: [
          { se: 2, maxEp: 13 },
          { se: 1, maxEp: 7 },
        ],
      }),
    ).toEqual([
      { season: 1, episodeCount: 7 },
      { season: 2, episodeCount: 13 },
    ]);
  });

  it('skips seasons with no episodes', () => {
    expect(seasonsFromPayload({ seasons: [{ se: 1, maxEp: 0 }] })).toEqual([]);
  });

  it('returns nothing for a malformed payload', () => {
    expect(seasonsFromPayload(null)).toEqual([]);
    expect(seasonsFromPayload({})).toEqual([]);
  });
});

describe('episodeItem', () => {
  it('carries the season and episode the api needs', () => {
    const item = episodeItem('999', 'Breaking Bad', 2, 5, 'https://c/still.jpg');

    expect(item.id).toBe('999:s2e5');
    expect(item.kind).toBe('episode');
    expect(item.season).toBe(2);
    expect(item.episodeNumber).toBe(5);
    expect(item.seriesTitle).toBe('Breaking Bad');
    expect(item.movieboxSubjectId).toBe('999');
    expect(item.badge).toBe('E5');
    expect(item.stream).toBeNull();
  });
});

describe('detailToSubject', () => {
  it('reads a detail payload and keeps the requested id', () => {
    const result = detailToSubject(
      { title: 'Breaking Bad [Hindi] S5', subjectType: 2, genre: 'Crime' },
      '1382465867459478920',
    );

    expect(result?.subjectId).toBe('1382465867459478920');
    expect(result?.subjectType).toBe(2);
    expect(result?.genre).toBe('Crime');
  });

  it('returns null for a malformed payload', () => {
    expect(detailToSubject(null, '1')).toBeNull();
  });
});

describe('detailBackdrop', () => {
  it('prefers a still over the cover', () => {
    expect(
      detailBackdrop({
        cover: { url: 'https://c/cover.jpg' },
        stills: [{ url: 'https://c/still.jpg' }],
      }),
    ).toBe('https://c/still.jpg');
  });

  it('falls back to the cover', () => {
    expect(detailBackdrop({ cover: { url: 'https://c/cover.jpg' } })).toBe(
      'https://c/cover.jpg',
    );
  });

  it('returns null when there is neither', () => {
    expect(detailBackdrop({})).toBeNull();
    expect(detailBackdrop(null)).toBeNull();
  });
});
