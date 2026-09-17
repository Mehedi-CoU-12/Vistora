import type { Playback } from '../services/streamResolver';
import type { ContentItem } from './content';

export interface PlayQueue {
  items: ContentItem[];

  index: number;
}

export type RootStackParamList = {
  Browse: undefined;

  Series: {
    seriesId: string;
    title: string;
  };

  Details: {
    item: ContentItem;
  };

  Player: {
    playback: Playback;
    title: string;
    subtitle?: string;

    queue?: PlayQueue;
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
