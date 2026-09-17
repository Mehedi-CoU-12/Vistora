import { useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { toAppError } from '../services/errors';
import { canResolveAny, resolveStream } from '../services/streamResolver';
import { beginResolving, endResolving } from '../state/playbackResolution';
import { recordPlayback } from '../state/continueWatching';
import type { ContentItem } from '../types/content';
import type { PlayQueue } from '../types/navigation';

export function usePlayItem(): (
  item: ContentItem,
  queue?: readonly ContentItem[],
) => void {
  const navigation = useNavigation();

  return useCallback(
    (item: ContentItem, queue?: readonly ContentItem[]) => {
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
            queue: buildQueue(item, queue),
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

function buildQueue(
  item: ContentItem,
  queue: readonly ContentItem[] | undefined,
): PlayQueue | undefined {
  if (!queue || queue.length < 2) {
    return undefined;
  }

  const index = queue.findIndex(entry => entry.id === item.id);

  return index < 0 ? undefined : { items: [...queue], index };
}

function unavailableMessage(item: ContentItem): string {
  if (item.unavailableLabel === 'Not started') {
    return `“${item.title}” has not started yet. There is nothing to play until it does.`;
  }

  return `“${item.title}” is not available to watch. No source could find a stream for it.`;
}
