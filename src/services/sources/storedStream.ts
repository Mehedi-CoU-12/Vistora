import type { ContentItem } from '../../types/content';
import type { StreamCandidate, StreamSource } from '../streamResolver';











































export const storedStreamSource: StreamSource = {
  id: 'stored',

  canResolve: (item: ContentItem) => item.stream !== null,

  resolve: async (item: ContentItem): Promise<StreamCandidate[]> => {
    if (item.stream === null) {
      return [];
    }

    return [
      {
        stream: item.stream,
        label: 'Library URL',
        





        quality: item.meta?.quality,
      },
    ];
  },

  












  ttlMs: 60 * 60 * 1000,
};
