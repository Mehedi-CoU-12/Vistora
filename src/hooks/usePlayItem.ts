import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { toAppError } from '../services/errors';
import { canResolveAny, resolveStream } from '../services/streamResolver';
import { beginResolving, endResolving } from '../state/playbackResolution';
import { recordPlayback } from '../state/continueWatching';
import type { ContentItem } from '../types/content';

export function usePlayItem(): (item: ContentItem) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem) => {
      if (item.kind === 'series') {
        navigation.navigate('Series', { seriesId: item.id, title: item.title });
        return;
      }

      if (!canResolveAny(item)) {
        Alert.alert('Not available', unavailableMessage(item));
        return;
      }

      if (!beginResolving(item.title)) {
        return;
      }

      const resolveAndPlay = async () => {
        try {
          const playback = await resolveStream(item);

          recordPlayback(item);

          navigation.navigate('Player', {
            playback,
            title: item.title,
            subtitle: item.subtitle,
          });
        } catch (error) {
          const appError = toAppError(error);

          Alert.alert(
            'Not available',
            appError.kind === 'notFound'
              ? unavailableMessage(item)
              : appError.userMessage,
          );
        } finally {
          endResolving();
        }
      };

      resolveAndPlay();
    },
    [navigation],
  );
}

function unavailableMessage(item: ContentItem): string {
  if (item.unavailableLabel === 'Not started') {
    return `“${item.title}” has not started yet. There is nothing to play until it does.`;
  }

  return `“${item.title}” is not available to watch. No source could find a stream for it.`;
}
