import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import type { ContentItem } from '../types/content';

































export function useOpenItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      if (item.kind === 'series') {
        navigation.navigate('Series', {
          seriesId: item.id,
          title: item.title,
        });
        return;
      }

      navigation.navigate('Details', { item });
    },
    [navigation],
  );
}
