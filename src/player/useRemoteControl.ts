import { useCallback, useMemo, useRef } from 'react';
import { useTVEventHandler, type HWEvent } from 'react-native';

import {
  actionForHardwareEvent,
  actionForKeyCode,
  type RemoteAction,
  type RemoteKeyEvent,
  type RemoteKeyHandlers,
} from './remoteKeys';

/**
 * ===========================================================================
 * Which half of a key press to act on -- measured, not assumed.
 * ===========================================================================
 * A physical press produces two events, ACTION_DOWN then ACTION_UP, and acting
 * on both would double every action. The obvious filter is "ignore ACTION_UP",
 * and on this app it silently ignores EVERY press: verified on an Android TV
 * emulator, the only event that arrives in the player is the UP.
 *
 * The reason is that the DOWN is consumed on its way through the view tree. A
 * focused view handles DPAD_DOWN for focus movement or for its own click, so
 * `ReactRootView.dispatchKeyEvent` never reaches the line that feeds the TV
 * event emitter -- but nothing consumes the UP, so that one gets through. Which
 * half survives therefore depends on what has focus and on the architecture,
 * and hard-coding either answer is how a remote ends up doing nothing at all.
 *
 * So the platform is allowed to tell us: the FIRST key action we ever see wins,
 * and from then on its twin is ignored. Deterministic, needs no timing
 * heuristic, and it keeps key repeat intact -- if DOWN is the surviving action,
 * a held key repeats and the accumulating seek grows; if only UP arrives, each
 * press counts once.
 */

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
 * Two delivery paths, one of which is dead on this architecture
 * ---------------------------------------------------------------------------
 * `keyHandlers` (the W3C `onKeyDown` path) is the one that works here, and it
 * must be spread onto a FOCUSED view or nothing arrives. `useTVEventHandler` is
 * kept for the old architecture and tvOS, where it is also the only route for
 * physical media keys. See `remoteKeys.ts` for the full story, including why the
 * first `onKeyDown` latches out the older path.
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
 */
export function useRemoteControl(
  actions: RemoteActions,
  { enabled }: { enabled: boolean },
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  /**
   * Set the first time a W3C key event arrives, and never cleared.
   *
   * `ReactRootView` calls the HW helper AND the JS key dispatcher, so on the old
   * architecture a single press can be reported twice. Latching means the first
   * path to prove it is alive becomes the only one we listen to, and a skip is
   * 10 seconds rather than 20.
   */
  const w3cAlive = useRef(false);

  /** The key action this platform actually delivers. See the note above. */
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

      // The dedicated media keys always scrub: they mean nothing else, so there
      // is no focus question to lose to.
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
        // Any other press -- arrows included -- simply wakes the overlay.
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

        // `eventKeyAction` is -1 for the events the fork synthesises rather than
        // reads off a KeyEvent; those are never paired, so they are always acted
        // on and never latch a preference.
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

  /**
   * Spread onto whichever view holds focus: the wake layer while the controls
   * are hidden, and the overlay itself while they are up (key events bubble, so
   * a press on a focused button reaches the overlay's root).
   */
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
