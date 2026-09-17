import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';

import { lockLandscape, releaseOrientation } from '../native/orientation';
import { VideoPlayer, type VideoPlayerHandle } from '../player/VideoPlayer';
import { useMetrics } from '../theme';
import type { RootStackParamList } from '../types/navigation';

export function PlayerScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const { isTV } = useMetrics();

  const playerRef = useRef<VideoPlayerHandle>(null);
  const [canDismiss, setCanDismiss] = useState(false);

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

  return (
    <VideoPlayer
      ref={playerRef}
      playback={params.playback}
      title={params.title}
      subtitle={params.subtitle}
      onExit={handleExit}
      onCanDismissChange={setCanDismiss}
    />
  );
}
