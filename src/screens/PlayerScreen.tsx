import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback} from 'react';

import {VideoPlayer} from '../player/VideoPlayer';
import type {RootStackParamList} from '../types/navigation';

/**
 * Thin adapter between navigation and the player.
 *
 * Its entire job is to unpack route params and provide an exit callback. All the
 * playback logic lives in VideoPlayer, which is what lets that component stay
 * reusable -- it could be embedded in a detail screen or a preview pane without
 * touching navigation at all.
 *
 * The stream arrives as a route param rather than being fetched here. The screen
 * that navigated already had the metadata, so re-querying Supabase would add a
 * spinner between pressing OK and seeing a picture, for no new information.
 */
export function PlayerScreen() {
  const navigation = useNavigation();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Player'>>();

  const handleExit = useCallback(() => {
    // `canGoBack` guards the case where the player is the first screen in the
    // stack, e.g. opened from a future deep link.
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <VideoPlayer
      stream={params.stream}
      title={params.title}
      subtitle={params.subtitle}
      onExit={handleExit}
    />
  );
}
