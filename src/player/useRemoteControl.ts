import { useCallback, useMemo, useRef } from 'react';
import { useTVEventHandler, type HWEvent } from 'react-native';

import {
  actionForHardwareEvent,
  actionForKeyCode,
  type RemoteAction,
  type RemoteKeyEvent,
  type RemoteKeyHandlers,
} from './remoteKeys';

export interface RemoteActions {
  onWake: () => void;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;

  onSkip: (direction: -1 | 1) => void;

  onMenu: () => void;

  onStop: () => void;

  shouldSeekWithArrows: () => boolean;
}

export function useRemoteControl(
  actions: RemoteActions,
  { enabled }: { enabled: boolean },
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const w3cAlive = useRef(false);

  const trustedKeyAction = useRef<number | null>(null);

  const dispatch = useCallback((action: RemoteAction) => {
    if (!enabledRef.current) {
      return;
    }

    const a = actionsRef.current;

    switch (action) {
      case 'playPause':
        a.onWake();
        a.onTogglePlay();
        break;

      case 'play':
        a.onWake();
        a.onPlay();
        break;

      case 'pause':
        a.onWake();
        a.onPause();
        break;

      case 'rewind':
        a.onWake();
        a.onSkip(-1);
        break;

      case 'fastForward':
        a.onWake();
        a.onSkip(1);
        break;

      case 'left':
        if (a.shouldSeekWithArrows()) {
          a.onSkip(-1);
        }
        a.onWake();
        break;

      case 'right':
        if (a.shouldSeekWithArrows()) {
          a.onSkip(1);
        }
        a.onWake();
        break;

      case 'menu':
      case 'info':
        a.onMenu();
        break;

      case 'stop':
        a.onStop();
        break;

      default:
        a.onWake();
    }
  }, []);

  useTVEventHandler(
    useCallback(
      (event: HWEvent) => {
        if (w3cAlive.current) {
          return;
        }

        const keyAction = event.eventKeyAction;

        if (typeof keyAction === 'number' && keyAction >= 0) {
          if (trustedKeyAction.current === null) {
            trustedKeyAction.current = keyAction;
          } else if (trustedKeyAction.current !== keyAction) {
            return;
          }
        }

        dispatch(actionForHardwareEvent(event.eventType));
      },
      [dispatch],
    ),
  );

  const keyHandlers = useMemo<RemoteKeyHandlers>(
    () => ({
      onKeyDown: (event: RemoteKeyEvent) => {
        w3cAlive.current = true;
        dispatch(actionForKeyCode(event.nativeEvent.code));
      },
    }),
    [dispatch],
  );

  return { keyHandlers };
}
