import { channelToContentItem } from '../types/content';
import type { ChannelRow } from '../types/database';

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
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('channelToContentItem', () => {
  it('marks channels live and carries the stream through', () => {
    const item = channelToContentItem(channel);

    expect(item.kind).toBe('channel');
    expect(item.badge).toBe('LIVE');
    expect(item.subtitle).toBe('Channel 101');
    expect(item.categoryId).toBe('cat-news');

    expect(item.stream).toEqual({
      url: 'https://cdn.example.com/live.m3u8',
      protocol: 'hls',
      headers: undefined,
      isLive: true,
    });
  });

  it('omits the subtitle when there is no channel number', () => {
    expect(
      channelToContentItem({ ...channel, channel_number: null }).subtitle,
    ).toBeUndefined();
  });
});
