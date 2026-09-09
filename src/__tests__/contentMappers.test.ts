import {
  channelToContentItem,
  movieToContentItem,
  sportsEventToContentItem,
} from '../types/content';
import type {ChannelRow, MovieRow, SportsEventRow} from '../types/database';

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
