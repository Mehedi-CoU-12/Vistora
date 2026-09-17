import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';

interface MovieBoxStream {
  url: string;
  quality: string;
  format: string;
  codecName?: string;
  resolutions?: string;
  signCookie?: string;
}

interface MovieBoxResponse {
  data?: {
    list?: MovieBoxStream[];
  };
  list?: MovieBoxStream[];
  streams?: MovieBoxStream[];
}

const MOVIEBOX_REFERER = 'https://sportslive.wine';

const MOVIEBOX_HOSTS = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

function getMovieBoxHosts(): string[] {
  const customApi = process.env.REACT_APP_MOVIEBOX_API?.trim();
  if (customApi) {
    return [customApi, ...MOVIEBOX_HOSTS];
  }
  return MOVIEBOX_HOSTS;
}

async function getMovieBoxStreams(
  item: ContentItem,
): Promise<MovieBoxStream[]> {
  const hosts = getMovieBoxHosts();
  if (hosts.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    title: item.title,
    type: item.kind === 'series' ? 'series' : 'movie',
    id: item.id,
  });

  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/streams?${params}`, {
        headers: {
          Referer: MOVIEBOX_REFERER,
          'User-Agent': 'Vistora/1.0',
        },
      });

      if (!response.ok) {
        continue;
      }

      const data: MovieBoxResponse = await response.json();
      const streams = data.data?.list || data.list || data.streams || [];
      const result = Array.isArray(streams) ? streams : [];

      if (result.length > 0) {
        console.log(`[movieboxStream] Got streams from ${host}`);
        return result;
      }
    } catch (error) {
      console.debug(
        `[movieboxStream] Host ${host} failed:`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }
  }

  console.warn('[movieboxStream] All hosts exhausted for:', item.title);
  return [];
}

function getMaxResolution(resolutions?: string): string {
  if (!resolutions) return '720p';

  const nums = resolutions
    .split(',')
    .map(r => parseInt(r.trim(), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => b - a);

  return nums.length > 0 ? `${nums[0]}p` : '720p';
}

function buildLabel(stream: MovieBoxStream): string {
  const quality = stream.quality || getMaxResolution(stream.resolutions);
  const codec = stream.codecName || stream.format || 'MP4';
  return `${quality} ${codec}`.trim();
}

export const movieboxStreamSource: StreamSource = {
  id: 'moviebox',

  canResolve: (item: ContentItem) =>
    item.stream === null && item.kind !== 'channel',

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    const streams = await getMovieBoxStreams(item);

    return streams
      .filter(stream => stream.url && stream.url.startsWith('http'))
      .map(stream => {
        const headers: Record<string, string> = {
          Referer: MOVIEBOX_REFERER,
          'User-Agent': 'Vistora/1.0',
        };

        if (stream.signCookie) {
          headers.Cookie = stream.signCookie
            .trim()
            .split(';')
            .map(s => s.trim())
            .filter(s => s)
            .join('; ');
        }

        return {
          stream: {
            url: stream.url,
            protocol: stream.url.includes('.mpd') ? 'dash' : 'hls',
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            isLive: false,
          },
          label: buildLabel(stream),
          quality: stream.quality || getMaxResolution(stream.resolutions),
        };
      });
  },

  ttlMs: 5 * 60 * 1000,
};
