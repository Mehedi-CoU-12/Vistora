import { useCallback, useRef } from 'react';
import { useTVEventHandler, type HWEvent } from 'react-native';

/**
 * Android KeyEvent.ACTION_UP. The fork emits both down and up for every key, so
 * acting on both would double every action.
 */
const ACTION_UP = 1;

export interface RemoteActions {
  /** Any key at all: bring the overlay back and restart its countdown. */
  onWake: () => void;
  onTogglePlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  /**
   * Skip one step back (-1) or forward (+1). A direction rather than a number of
   * seconds, because how far one press goes is the player's business and the
   * remote should not have to agree with the on-screen buttons about it.
   */
  onSkip: (direction: -1 | 1) => void;
  /** MENU or INFO: open the settings panel. */
  onMenu: () => void;
  /** STOP: leave the player. */
  onStop: () => void;
  /**
   * Whether left/right should scrub on this press rather than move focus.
   *
   * Asked per press rather than passed as a flag, because the answer depends on
   * state that changes between presses (is the overlay up, is the scrub bar
   * focused, is the settings panel open) and a stale answer here is the
   * difference between scrubbing and navigating.
   */
  shouldSeekWithArrows: () => boolean;
}

/**
 * The TV remote.
 *
 * ---------------------------------------------------------------------------
 * Why left/right cannot simply always seek
 * ---------------------------------------------------------------------------
 * The overlay contains a row of buttons, and the platform's focus engine needs
 * left/right to move between them. Seek on the same press and every attempt to
 * reach the Back button scrubs the video -- the classic TV player bug. So the
 * arrows scrub only when nothing else wants them:
 *
 *   overlay hidden          -> scrub (there is nothing on screen to focus)
 *   scrub bar focused       -> scrub (the bar sits alone on its row, so left and
 *                              right have nowhere to move focus to anyway)
 *   overlay up, on a button -> move focus, which is what the eye expects
 *   settings panel open     -> move focus, always
 *
 * `VideoPlayer` owns that decision and answers it through
 * `shouldSeekWithArrows`; this hook only asks.
 *
 * ---------------------------------------------------------------------------
 * Two things this hook must never do
 * ---------------------------------------------------------------------------
 * 1. Consume the arrows. We observe them; the focus engine still gets them.
 *    Swallowing a press would strand the user looking at a button they cannot
 *    reach.
 * 2. Run on a phone. The fork's key emitter is attached to the activity on every
 *    Android device, not only on TVs, so on a phone this would fire for the
 *    volume rocker -- waking the overlay for something that is not a player
 *    gesture at all. The hook is called unconditionally, as hooks must be, and
 *    returns immediately when `enabled` is false.
 *
 * `useTVEventHandler` is also the ONLY way to see the physical media keys
 * (play/pause, rewind, fast-forward). Those never reach a Pressable, because
 * they are not focus events -- they arrive at the activity.
 */
export function useRemoteControl(
  actions: RemoteActions,
  { enabled }: { enabled: boolean },
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useTVEventHandler(
    useCallback((event: HWEvent) => {
      if (!enabledRef.current || event.eventKeyAction === ACTION_UP) {
        return;
      }

      const a = actionsRef.current;

      switch (event.eventType) {
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

        // The dedicated media keys always scrub: they mean nothing else, so
        // there is no focus question to lose to.
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
          // Any other press simply wakes the overlay.
          a.onWake();
      }
    }, []),
  );
}
