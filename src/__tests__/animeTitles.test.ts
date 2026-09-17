import {
  cleanSeriesTitle,
  isNonEpisodeTitle,
  parseEpisodeNumber,
  parseIsoDuration,
  parseSeasonNumber,
} from '../../scripts/animeTitles.mjs';















describe('parseEpisodeNumber', () => {
  it.each([
    ['Show Name | Episode 7 | English Sub', 7],
    ['Show Name Episode 12', 12],
    ['Show Name EP07', 7],
    ['Show Name ep. 3', 3],
    ['Show Name E07', 7],
    ['Show Name S2E07', 7],
    ['Show Name S2 E07', 7],
    ['Show Name | 07 | English Sub', 7],
    ['Show Name - 07', 7],
    ['Show Name #7', 7],
    ['Show Name 07', 7],
  ])('reads %j as episode %i', (title, expected) => {
    expect(parseEpisodeNumber(title)).toBe(expected);
  });

  it('returns null when the title names no episode, rather than guessing', () => {
    
    
    expect(parseEpisodeNumber('Show Name')).toBeNull();
    expect(parseEpisodeNumber('')).toBeNull();
    expect(parseEpisodeNumber(null)).toBeNull();
  });

  it('does not mistake a year or a resolution for an episode', () => {
    expect(parseEpisodeNumber('Show Name (2024)')).toBeNull();
    expect(parseEpisodeNumber('Show Name 1080p')).toBeNull();
    expect(parseEpisodeNumber('Show Name - 2160')).toBeNull();
  });

  it('does not mistake a season number for an episode number', () => {
    
    
    expect(parseEpisodeNumber('Show Name - Season 2')).toBeNull();
  });

  it('does not find "ep" inside an ordinary word', () => {
    expect(parseEpisodeNumber('Sleepy Princess')).toBeNull();
    
    expect(parseEpisodeNumber('Sleepy Princess 5')).toBe(5);
  });

  it('trusts an explicit "Episode N" even when N looks implausible', () => {
    
    
    expect(parseEpisodeNumber('Show Name Episode 1080')).toBe(1080);
  });
});

describe('parseSeasonNumber', () => {
  it('defaults to 1, because almost nothing says "Season 1"', () => {
    expect(parseSeasonNumber('Show Name Episode 4')).toBe(1);
    expect(parseSeasonNumber('')).toBe(1);
  });

  it.each([
    ['Show Name Season 2 Episode 3', 2],
    ['Show Name S2E07', 2],
    ['Show Name S2 E07', 2],
  ])('reads %j as season %i', (title, expected) => {
    expect(parseSeasonNumber(title)).toBe(expected);
  });

  it('ignores an absurd season number rather than storing it', () => {
    
    
    expect(parseSeasonNumber('Show Name Season 0')).toBe(1);
  });
});

describe('isNonEpisodeTitle', () => {
  it.each([
    'Show Name | PV | English Sub',
    'Show Name Official Trailer',
    'Show Name Opening Theme',
    'Show Name Season 2 Teaser',
    'Show Name Recap',
    
    
    
    
    'Trailers and PVs',
    'Show Name Openings',
  ])('rejects %j', title => {
    expect(isNonEpisodeTitle(title)).toBe(true);
  });

  it('keeps an ordinary episode', () => {
    expect(isNonEpisodeTitle('Show Name | Episode 7 | English Sub')).toBe(false);
  });
});

describe('cleanSeriesTitle', () => {
  it('strips the decoration uploaders wrap around a series name', () => {
    expect(cleanSeriesTitle('[Official] Show Name | English Sub')).toBe(
      'Show Name',
    );
    expect(cleanSeriesTitle('Show Name Complete Series')).toBe('Show Name');
  });

  it('strips the season marker, because AniList indexes seasons separately', () => {
    expect(cleanSeriesTitle('Show Name Season 2')).toBe('Show Name');
  });

  it('leaves an ordinary title alone', () => {
    expect(cleanSeriesTitle('Show Name')).toBe('Show Name');
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT23M40S', 1420],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['PT1H', 3600],
  ])('converts %j to %i seconds', (value, expected) => {
    expect(parseIsoDuration(value)).toBe(expected);
  });

  it('returns null for anything it cannot read, including a zero duration', () => {
    
    
    expect(parseIsoDuration('PT0S')).toBeNull();
    expect(parseIsoDuration('not a duration')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});
