import {
  useFocusEffect,
  useNavigation,
  usePreventRemove,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import React, {useCallback, useRef, useState} from 'react';

import {lockLandscape, releaseOrientation} from '../native/orientation';
import {VideoPlayer, type VideoPlayerHandle} from '../player/VideoPlayer';
import {useMetrics} from '../theme';
import type {RootStackParamList} from '../types/navigation';

/**
 * Thin adapter between navigation and the player.
 *
 * Its entire job is to unpack route params, provide an exit callback, and own
 * the one navigation concern the player cannot: intercepting Back. All the
 * playback logic lives in VideoPlayer, which is what lets that component stay
 * reusable -- it could be embedded in a detail screen or a preview pane without
 * touching navigation at all.
 *
 * The stream arrives as a route param rather than being fetched here. The screen
 * that navigated already had the metadata, so re-querying Supabase would add a
 * spinner between pressing OK and seeing a picture, for no new information.
 *
 * ---------------------------------------------------------------------------
 * Why Back is intercepted here rather than inside the player
 * ---------------------------------------------------------------------------
 * With the settings panel open, Back must close the panel; while the controls
 * are locked it must do nothing. `BackHandler` is the documented way to express
 * that and it does not work under this navigator: react-native-screens pops the
 * route natively, so the press never reaches a JavaScript handler. Verified on
 * an Android TV emulator -- one Back press with the panel open left the player
 * entirely.
 *
 * `usePreventRemove` is the navigator's own hook for exactly this, and it
 * catches every route removal, not just the hardware key. The player reports
 * whether it has something to close and exposes `dismissTop()` to do it, so the
 * decision stays with the player and only the interception lives here.
 *
 * ---------------------------------------------------------------------------
 * Why the landscape lock lives here too
 * ---------------------------------------------------------------------------
 * On a phone, browsing follows the device but a video should not: a 16:9 stream
 * in a portrait window is a band across the middle with two thirds of the
 * display unused. So this screen holds the display landscape for as long as it
 * is on screen, and gives orientation back when it leaves.
 *
 * It belongs here rather than in `VideoPlayer` for the same reason Back does.
 * "Which way up is the device" is a property of the screen the player happens to
 * be filling, not of playback -- the same component embedded in a preview pane
 * must not rotate the phone. Keeping it out means `VideoPlayer` still imports
 * nothing from navigation and nothing from the platform.
 */
export function PlayerScreen() {
  const navigation = useNavigation();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const {isTV} = useMetrics();

  const playerRef = useRef<VideoPlayerHandle>(null);
  const [canDismiss, setCanDismiss] = useState(false);

  usePreventRemove(canDismiss, () => {
    playerRef.current?.dismissTop();
  });

  /**
   * `useFocusEffect` rather than `useEffect`, because this must follow focus and
   * not merely mounting. Under a native stack the screen behind stays mounted,
   * so were anything ever pushed on top of the player, a mount-scoped effect
   * would hold the phone landscape underneath it. The cleanup also runs on the
   * way out of a back gesture that is later cancelled, which is correct: focus
   * is the thing that actually tracks "the player is what the user is looking
   * at".
   *
   * TV is left alone entirely. It is already landscape by its resting policy,
   * and asking for SENSOR_LANDSCAPE there would mean a television consulting an
   * accelerometer it does not have.
   */
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
    // `canGoBack` guards the case where the player is the first screen in the
    // stack, e.g. opened from a future deep link.
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <VideoPlayer
      ref={playerRef}
      stream={params.stream}
      title={params.title}
      subtitle={params.subtitle}
      onExit={handleExit}
      onCanDismissChange={setCanDismiss}
    />
  );
}
