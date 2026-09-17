import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { lockLandscape, releaseOrientation } from '../native/orientation';
import { VideoPlayer, type VideoPlayerHandle } from '../player/VideoPlayer';
import { toAppError } from '../services/errors';
import { resolveStream } from '../services/streamResolver';
import { recordPlayback } from '../state/continueWatching';
import { useMetrics } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type PlayerNavigation = NativeStackNavigationProp<RootStackParamList, 'Player'>;

export function PlayerScreen() {
  const navigation = useNavigation<PlayerNavigation>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const { isTV } = useMetrics();

  const playerRef = useRef<VideoPlayerHandle>(null);
  const [canDismiss, setCanDismiss] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const queue = params.queue;

  const nextItem = useMemo(
    () => (queue ? queue.items[queue.index + 1] : undefined),
    [queue],
  );

  usePreventRemove(canDismiss, () => {
    playerRef.current?.dismissTop();
  });

  useFocusEffect(
    useCallback(() => {
      if (isTV) {
        return undefined;
      }

      lockLandscape();
      return releaseOrientation;
    }, [isTV]),
  );

  const handleExit = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  const handlePlayNext = useCallback(() => {
    if (!queue || !nextItem || advancing) {
      return;
    }

    setAdvancing(true);

    const advance = async () => {
      try {
        const playback = await resolveStream(nextItem);

        recordPlayback(nextItem);

        navigation.setParams({
          playback,
          title: nextItem.title,
          subtitle: nextItem.subtitle,
          queue: { items: queue.items, index: queue.index + 1 },
        });
      } catch (error) {
        const appError = toAppError(error);

        Alert.alert(
          'Not available',
          appError.kind === 'notFound'
            ? 'The next episode did not start. No source could find a stream for it.'
            : appError.userMessage,
        );
      } finally {
        setAdvancing(false);
      }
    };

    advance();
  }, [advancing, navigation, nextItem, queue]);

  const upNext = useMemo(
    () =>
      nextItem
        ? { title: nextItem.title, subtitle: nextItem.subtitle }
        : undefined,
    [nextItem],
  );

  return (
    <VideoPlayer
      ref={playerRef}
      playback={params.playback}
      title={params.title}
      subtitle={params.subtitle}
      upNext={upNext}
      onPlayNext={nextItem ? handlePlayNext : undefined}
      advancing={advancing}
      onExit={handleExit}
      onCanDismissChange={setCanDismiss}
    />
  );
}
