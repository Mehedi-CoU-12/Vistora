import { env } from '../../config/env';
import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';

interface ExternalStreamResponse {
  url: string;
  quality?: string;
  codec?: string;
  format?: string;
  resolutions?: string;
  headers?: Record<string, string>;
}

const EXTERNAL_API_BASE = env.externalStreamApi;

async function fetchExternalStreams(
  item: ContentItem,
): Promise<ExternalStreamResponse[]> {
  if (!EXTERNAL_API_BASE || item.stream !== null) {
    return [];
  }

  try {
    const endpoint = `${EXTERNAL_API_BASE}/streams`;
    const params = new URLSearchParams({
      title: item.title,
      type: item.kind,
      id: item.id,
    });

    const response = await fetch(`${endpoint}?${params}`);
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data : data.streams || [];
  } catch (error) {
    console.warn('[externalStream] Failed to fetch streams:', error);
    return [];
  }
}

export const externalStreamSource: StreamSource = {
  id: 'external',

  canResolve: (item: ContentItem) =>
    !!EXTERNAL_API_BASE && item.stream === null,

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    const streams = await fetchExternalStreams(item);

    return streams
      .filter(stream => stream.url && stream.url.startsWith('http'))
      .map(stream => {
        const quality =
          stream.quality ||
          (stream.resolutions ? stream.resolutions.split(',')[0] : undefined);

        const label = stream.format
          ? `${quality || 'Auto'} ${stream.format}${
              stream.codec ? ` (${stream.codec})` : ''
            }`
          : quality || 'Stream';

        return {
          stream: {
            url: stream.url,
            protocol: 'hls' as const,
            headers: stream.headers,
            isLive: false,
          },
          label: label.trim(),
          quality,
        };
      });
  },

  ttlMs: 5 * 60 * 1000,
};
