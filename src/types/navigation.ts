import type { Playback } from '../services/streamResolver';
import type { ContentItem } from './content';

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
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
