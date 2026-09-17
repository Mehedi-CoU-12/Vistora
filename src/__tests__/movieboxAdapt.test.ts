import {
  cleanTitle,
  isDeprecationNoticeUrl,
  matchKey,
  playInfoToCandidates,
  resolveDashManifestFromPolicy,
  searchToSubjects,
  STREAM_REFERER,
} from '../services/sources/moviebox/adapt';
import { base64Encode, utf8Bytes } from '../services/sources/moviebox/crypto';
import { selectSubject } from '../services/sources/movieboxStream';

const policyCookie = (resource: string): string => {
  const policy = JSON.stringify({
    Statement: [
      { Resource: resource, Condition: { DateLessThan: { 'AWS:EpochTime': 1788879894 } } },
    ],
  });
  const encoded = base64Encode(utf8Bytes(policy));
  return `CloudFront-Policy=${encoded};CloudFront-Signature=abc;CloudFront-Key-Pair-Id=KMHN1LQ1HEUPL;`;
};

describe('resolveDashManifestFromPolicy', () => {
  it('recovers the manifest directory from a signing policy', () => {
    const cookie = policyCookie(
      'https://sacdn.hakunaymatata.com/dash/4179386086617137184_0_0_1080_h265_518/*',
    );

    expect(resolveDashManifestFromPolicy(cookie)).toBe(
      'https://sacdn.hakunaymatata.com/dash/4179386086617137184_0_0_1080_h265_518/index.mpd',
    );
  });

  it('returns null for a cookie with no policy or a corrupt one', () => {
    expect(resolveDashManifestFromPolicy('')).toBeNull();
    expect(resolveDashManifestFromPolicy('CloudFront-Signature=abc;')).toBeNull();
    expect(resolveDashManifestFromPolicy('CloudFront-Policy=invalid_base64;')).toBeNull();
  });

  it('ignores a policy whose resource is not an http url', () => {
    expect(resolveDashManifestFromPolicy(policyCookie('s3://bucket/key/*'))).toBeNull();
  });
});

describe('isDeprecationNoticeUrl', () => {
  it('spots the notice clip the api serves in place of a stream', () => {
    expect(isDeprecationNoticeUrl('https://cdn.test/notice.mp4')).toBe(true);
    expect(
      isDeprecationNoticeUrl(
        'https://macdn.aoneroom.com/other/2026/09/01/9a0461bc39da389663bf3dbb17091d3f.mp4',
      ),
    ).toBe(true);
  });

  it('passes a real stream through', () => {
    expect(isDeprecationNoticeUrl('https://sacdn.test/dash/123/index.mpd')).toBe(false);
  });
});

describe('playInfoToCandidates', () => {
  it('prefers the manifest from the signing cookie over the plain url', () => {
    const cookie = policyCookie('https://sacdn.example.com/dash/12345_0_0_1080_h265_518/*');

    const candidates = playInfoToCandidates(
      {
        title: 'Sample Movie',
        displayResolutions: '480,720,1080',
        streams: [
          {
            id: '9999',
            format: 'MP4',
            codecName: 'hevc',
            resolutions: '1080,720,480',
            url: 'https://macdn.example.com/notice.mp4',
            signCookie: cookie,
          },
        ],
      },
      'TestAgent/1.0',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].stream.url).toBe(
      'https://sacdn.example.com/dash/12345_0_0_1080_h265_518/index.mpd',
    );
    expect(candidates[0].stream.protocol).toBe('dash');
    expect(candidates[0].quality).toBe('multi');
    expect(candidates[0].label).toBe('Multi-Res hevc');
    expect(candidates[0].stream.headers?.Referer).toBe(STREAM_REFERER);
    expect(candidates[0].stream.headers?.['User-Agent']).toBe('TestAgent/1.0');
    expect(candidates[0].stream.headers?.Cookie).toContain('CloudFront-Policy=');
    expect(candidates[0].stream.isLive).toBe(false);
  });

  it('uses the plain url when there is no signing cookie', () => {
    const candidates = playInfoToCandidates(
      {
        streams: [
          {
            format: 'MP4',
            codecName: 'h264',
            resolutions: '720',
            url: 'https://cdn.example.com/video.mp4',
          },
        ],
      },
      'TestAgent/1.0',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].stream.url).toBe('https://cdn.example.com/video.mp4');
    expect(candidates[0].stream.protocol).toBe('mp4');
    expect(candidates[0].quality).toBe('720p');
    expect(candidates[0].label).toBe('720p h264');
    expect(candidates[0].stream.headers?.Cookie).toBeUndefined();
  });

  it('marks an hls url as hls', () => {
    const candidates = playInfoToCandidates(
      { streams: [{ url: 'https://cdn.example.com/master.m3u8', resolutions: '1080' }] },
      'TestAgent/1.0',
    );

    expect(candidates[0].stream.protocol).toBe('hls');
  });

  it('drops a stream that only offers the deprecation notice', () => {
    expect(
      playInfoToCandidates(
        { streams: [{ url: 'https://macdn.example.com/notice.mp4' }] },
        'TestAgent/1.0',
      ),
    ).toEqual([]);
  });

  it('falls back to displayResolutions when a stream carries none', () => {
    const candidates = playInfoToCandidates(
      {
        displayResolutions: '1080,720',
        streams: [{ url: 'https://cdn.example.com/v.mp4', format: 'MP4' }],
      },
      'TestAgent/1.0',
    );

    expect(candidates[0].quality).toBe('multi');
  });

  it('returns nothing for empty, malformed or missing payloads', () => {
    expect(playInfoToCandidates({ streams: [] }, 'a')).toEqual([]);
    expect(playInfoToCandidates({}, 'a')).toEqual([]);
    expect(playInfoToCandidates(null, 'a')).toEqual([]);
    expect(playInfoToCandidates('nonsense', 'a')).toEqual([]);
    expect(playInfoToCandidates({ streams: [null, 42, {}] }, 'a')).toEqual([]);
  });
});

describe('searchToSubjects', () => {
  it('reads the nested results shape', () => {
    const subjects = searchToSubjects({
      results: [
        {
          subjects: [
            { subjectId: '12345', title: 'Interstellar', subjectType: 1, releaseDate: '2014-11-05' },
            { subjectId: '67890', title: 'Breaking Bad', subjectType: 2 },
          ],
        },
      ],
    });

    expect(subjects).toEqual([
      { subjectId: '12345', title: 'Interstellar', subjectType: 1, releaseYear: 2014 },
      { subjectId: '67890', title: 'Breaking Bad', subjectType: 2, releaseYear: null },
    ]);
  });

  it('reads the flattened list shape', () => {
    expect(
      searchToSubjects({ list: [{ subjectId: '1', title: 'Solo', subjectType: 1 }] }),
    ).toHaveLength(1);
  });

  it('accepts a numeric subject id', () => {
    expect(
      searchToSubjects({ list: [{ subjectId: 777, title: 'Numeric' }] })[0].subjectId,
    ).toBe('777');
  });

  it('skips entries with no id or no title', () => {
    expect(
      searchToSubjects({ list: [{ title: 'No id' }, { subjectId: '1' }, null] }),
    ).toEqual([]);
  });

  it('returns nothing for a malformed payload', () => {
    expect(searchToSubjects(null)).toEqual([]);
    expect(searchToSubjects({ results: 'nope' })).toEqual([]);
  });
});

describe('cleanTitle', () => {
  it('strips release-group noise', () => {
    expect(cleanTitle('[Dual Audio] Interstellar')).toBe('Interstellar');
    expect(cleanTitle('Interstellar [1080p]')).toBe('Interstellar');
    expect(cleanTitle('Interstellar - Hindi Dub')).toBe('Interstellar');
    expect(cleanTitle('Breaking Bad Season 2')).toBe('Breaking Bad');
    expect(cleanTitle('Breaking Bad S02')).toBe('Breaking Bad');
    expect(cleanTitle('Interstellar 1080p')).toBe('Interstellar');
  });

  it('keeps a year in parentheses but drops other parentheticals', () => {
    expect(cleanTitle('Interstellar (2014)')).toBe('Interstellar (2014)');
    expect(cleanTitle('Interstellar (Extended Cut)')).toBe('Interstellar');
  });

  it('never returns empty for a non-empty input', () => {
    expect(cleanTitle('[tag]')).toBe('[tag]');
    expect(cleanTitle('   ')).toBe('');
  });
});

describe('matchKey', () => {
  it('collapses punctuation and case so equivalent titles compare equal', () => {
    expect(matchKey('The Lord of the Rings!')).toBe(matchKey('the lord of the rings'));
    expect(matchKey('Spider-Man: No Way Home')).toBe(matchKey('Spider Man No Way Home'));
  });
});

describe('selectSubject', () => {
  const movie = (subjectId: string, title: string, releaseYear: number | null = null) => ({
    subjectId,
    title,
    subjectType: 1,
    releaseYear,
  });

  it('prefers an exact title match over search rank', () => {
    const picked = selectSubject(
      [movie('1', 'Making Interstellar'), movie('2', 'Interstellar')],
      'Interstellar',
      1,
    );

    expect(picked?.subjectId).toBe('2');
  });

  it('breaks a tie between remakes on the year', () => {
    const picked = selectSubject(
      [movie('old', 'Dune', 1984), movie('new', 'Dune', 2021)],
      'Dune',
      1,
      2021,
    );

    expect(picked?.subjectId).toBe('new');
  });

  it('prefers the requested subject type', () => {
    const picked = selectSubject(
      [movie('film', 'Fargo'), { subjectId: 'show', title: 'Fargo', subjectType: 2, releaseYear: null }],
      'Fargo',
      2,
    );

    expect(picked?.subjectId).toBe('show');
  });

  it('falls back to the top hit when nothing matches exactly', () => {
    expect(
      selectSubject([movie('1', 'Something Else')], 'Interstellar', 1)?.subjectId,
    ).toBe('1');
  });

  it('returns null when there is nothing to pick', () => {
    expect(selectSubject([], 'Interstellar', 1)).toBeNull();
  });
});
