import {
  channelToContentItem,
  episodeToContentItem,
  groupEpisodesBySeason,
  movieToContentItem,
  seriesToContentItem,
  sportsEventToContentItem,
} from '../types/content';
import type {
  ChannelRow,
  EpisodeRow,
  MovieRow,
  SeriesRow,
  SportsEventRow,
} from '../types/database';

const timestamps = {created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'};

const channel: ChannelRow = {
  id: 'c1',
  slug: 'news-one',
  name: 'News One',
  description: null,
  logo_url: 'https://cdn.example.com/logo.png',
  stream_url: 'https://cdn.example.com/live.m3u8',
  stream_protocol: 'hls',
  stream_headers: null,
  category_id: 'cat-news',
  channel_number: 101,
  sort_order: 0,
  is_active: true,
  ...timestamps,
};

const movie: MovieRow = {
  id: 'm1',
  slug: 'a-film',
  title: 'A Film',
  description: null,
  poster_url: null,
  backdrop_url: null,
  stream_url: 'https://cdn.example.com/film.m3u8',
  stream_protocol: 'hls',
  release_year: 2011,
  duration_seconds: 5400,
  content_rating: 'PG',
  category_id: 'cat-action',
  sort_order: 0,
  is_active: true,
  ...timestamps,
};

const event: SportsEventRow = {
  id: 'e1',
  slug: 'a-match',
  title: 'A vs B',
  sport_slug: 'football',
  competition: 'Cup',
  home_team: 'A',
  away_team: 'B',
  description: null,
  poster_url: null,
  stream_url: null,
  stream_protocol: 'hls',
  starts_at: '2026-06-01T18:00:00Z',
  ends_at: null,
  status: 'scheduled',
  category_id: null,
  is_active: true,
  ...timestamps,
};

describe('channelToContentItem', () => {
  it('marks channels live and carries the stream through', () => {
    const item = channelToContentItem(channel);

    expect(item.kind).toBe('channel');
    expect(item.badge).toBe('LIVE');
    expect(item.subtitle).toBe('Channel 101');
    expect(item.categoryId).toBe('cat-news');
    // A channel is a continuous broadcast, so the player must disable seeking.
    expect(item.stream).toEqual({
      url: 'https://cdn.example.com/live.m3u8',
      protocol: 'hls',
      headers: undefined,
      isLive: true,
    });
  });

  it('omits the subtitle when there is no channel number', () => {
    expect(channelToContentItem({...channel, channel_number: null}).subtitle).toBeUndefined();
  });
});

describe('movieToContentItem', () => {
  it('builds a year + duration subtitle and is never live', () => {
    const item = movieToContentItem(movie);

    expect(item.subtitle).toBe('2011 · 1h 30m');
    expect(item.stream?.isLive).toBe(false);
  });

  it('drops missing metadata rather than rendering an empty separator', () => {
    expect(
      movieToContentItem({...movie, release_year: null, duration_seconds: null}).subtitle,
    ).toBeUndefined();
  });

  it('formats a sub-hour duration without an hours part', () => {
    expect(movieToContentItem({...movie, duration_seconds: 1500}).subtitle).toBe('2011 · 25m');
  });
});

describe('sportsEventToContentItem', () => {
  // This is the behaviour the whole "not playable" UI path depends on: a
  // fixture with no published URL must produce a null stream, not an item
  // pointing at an empty string.
  it('returns a null stream for a fixture with no URL yet', () => {
    const item = sportsEventToContentItem(event);

    expect(item.stream).toBeNull();
    expect(item.badge).toBeUndefined();
  });

  it('returns a live stream for an event that is on air', () => {
    const item = sportsEventToContentItem({
      ...event,
      status: 'live',
      stream_url: 'https://cdn.example.com/match.m3u8',
    });

    expect(item.badge).toBe('LIVE');
    expect(item.stream).toEqual({
      url: 'https://cdn.example.com/match.m3u8',
      protocol: 'hls',
      isLive: true,
    });
    expect(item.subtitle).toBe('Cup · On now');
  });

  it('labels a finished event rather than showing a kickoff time', () => {
    expect(sportsEventToContentItem({...event, status: 'finished'}).subtitle).toBe(
      'Cup · Full time',
    );
  });
});


// ---------------------------------------------------------------------------
// Series and episodes
// ---------------------------------------------------------------------------

const series: SeriesRow = {
  id: 's1',
  slug: 'a-show',
  title: 'A Show',
  description: 'About a show.',
  poster_url: 'https://cdn.example.com/poster.jpg',
  backdrop_url: 'https://cdn.example.com/banner.jpg',
  release_year: 2021,
  content_rating: null,
  source: 'youtube',
  source_id: 'PL123',
  episode_count: 24,
  category_id: 'cat-anime',
  sort_order: 0,
  is_active: true,
  ...timestamps,
};

const episode: EpisodeRow = {
  id: 'ep1',
  series_id: 's1',
  slug: 'a-show-s1e1',
  title: 'The First One',
  description: 'Things happen.',
  thumbnail_url: 'https://cdn.example.com/still.jpg',
  stream_url: 'https://www.youtube.com/watch?v=abc',
  stream_protocol: 'youtube',
  stream_headers: null,
  season: 1,
  episode_number: 1,
  duration_seconds: 1420,
  air_date: '2021-04-07',
  is_active: true,
  ...timestamps,
};

describe('seriesToContentItem', () => {
  it('summarises a series as year and episode count', () => {
    expect(seriesToContentItem(series).subtitle).toBe('2021 \u00b7 24 episodes');
  });

  it('says "1 episode" for a single-episode series', () => {
    expect(
      seriesToContentItem({...series, episode_count: 1}).subtitle,
    ).toBe('2021 \u00b7 1 episode');
  });

  it('omits the count entirely when there are no episodes yet', () => {
    expect(seriesToContentItem({...series, episode_count: 0}).subtitle).toBe(
      '2021',
    );
  });

  it('has no stream, because a series is not a thing you can play', () => {
    expect(seriesToContentItem(series).stream).toBeNull();
  });

  it('carries NO unavailableLabel, unlike an unplayable fixture', () => {
    // This is the distinction the card relies on. Both a series and an
    // unpublished fixture have `stream: null`; only the fixture is broken, and
    // stamping "Not started" on every show in the Anime tab would be a lie.
    expect(seriesToContentItem(series).unavailableLabel).toBeUndefined();
    expect(sportsEventToContentItem(event).unavailableLabel).toBe('Not started');
  });
});

describe('episodeToContentItem', () => {
  it('badges the episode number and subtitles the running time', () => {
    const item = episodeToContentItem(episode);
    expect(item.badge).toBe('E1');
    expect(item.subtitle).toBe('24m');
  });

  it('keeps the youtube protocol, so the app knows not to decode it', () => {
    expect(episodeToContentItem(episode).stream).toEqual({
      url: 'https://www.youtube.com/watch?v=abc',
      protocol: 'youtube',
      headers: undefined,
      isLive: false,
    });
  });

  it('has no categoryId, so a category filter can never match one', () => {
    expect(episodeToContentItem(episode).categoryId).toBeNull();
  });
});

describe('groupEpisodesBySeason', () => {
  const make = (season: number, episode_number: number): EpisodeRow => ({
    ...episode,
    id: `s${season}e${episode_number}`,
    slug: `a-show-s${season}e${episode_number}`,
    season,
    episode_number,
  });

  it('orders seasons and the episodes inside them, whatever order they arrive in', () => {
    // Deliberately shuffled. The query does order these, but the grouping is
    // only correct if this function does not depend on that.
    const grouped = groupEpisodesBySeason([
      make(2, 2),
      make(1, 3),
      make(2, 1),
      make(1, 1),
      make(1, 2),
    ]);

    expect(grouped.map(s => s.season)).toEqual([1, 2]);
    expect(grouped[0].episodes.map(e => e.badge)).toEqual(['E1', 'E2', 'E3']);
    expect(grouped[1].episodes.map(e => e.badge)).toEqual(['E1', 'E2']);
  });

  it('handles a gap in the numbering without renumbering', () => {
    // Episodes go missing -- a promo dropped by the importer, an upload pulled
    // by the channel. Closing the gap would silently relabel every episode
    // after it, so the list must show what is actually there.
    const grouped = groupEpisodesBySeason([make(1, 1), make(1, 4)]);
    expect(grouped[0].episodes.map(e => e.badge)).toEqual(['E1', 'E4']);
  });

  it('returns no seasons for no episodes', () => {
    expect(groupEpisodesBySeason([])).toEqual([]);
  });
});
