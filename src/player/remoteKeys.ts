import type { NativeSyntheticEvent } from 'react-native';

/**
 * ===========================================================================
 * Hardware keys under the New Architecture, and why there are two paths.
 * ===========================================================================
 * `useTVEventHandler` is the documented way to read a TV remote, and on this
 * app's architecture it never fires. That is worth spelling out, because the
 * symptom is silent and total: the player's overlay auto-hides after four
 * seconds and no key can bring it back.
 *
 * Follow the key event down through the fork's own source:
 *
 *   Old architecture   ReactRootView.dispatchKeyEvent ->
 *                      ReactAndroidHWInputDeviceHelper.handleKeyEvent ->
 *                      emits the "onHWKeyEvent" device event, which is exactly
 *                      what `useTVEventHandler` subscribes to.
 *
 *   Bridgeless/Fabric  ReactSurfaceView.dispatchKeyEvent -> JSKeyDispatcher
 *                      only. It never touches the HW helper, so "onHWKeyEvent"
 *                      is never emitted and the subscription sits idle forever.
 *
 * This app is bridgeless (the log line at startup reads `"fabric":true`), so the
 * live path is `JSKeyDispatcher`, which dispatches W3C-style `onKeyDown` /
 * `onKeyUp` events to the currently focused view. Two consequences shape the
 * player:
 *
 *   1. Something must be FOCUSED. JSKeyDispatcher returns early when
 *      `focusedViewTag == View.NO_ID`, so a screen with no focusable view gets
 *      no key events at all. That is why the player keeps a focusable wake
 *      layer on screen while its controls are hidden.
 *
 *   2. There are NO media keys. The dispatcher's keycode table covers letters,
 *      digits, modifiers, Enter and the four arrows -- and nothing else. Play,
 *      pause, rewind and fast-forward are simply not in it, so under this
 *      architecture a physical media key cannot reach JavaScript by either
 *      route. `useRemoteControl` still handles them, because it costs nothing
 *      and they work on the old architecture and on tvOS.
 *
 * Both paths are therefore wired, and the first `onKeyDown` latches the W3C one
 * as authoritative -- `ReactRootView` calls BOTH dispatchers, so on the old
 * architecture the same press would otherwise be handled twice and every skip
 * would jump 20 seconds.
 */

/** The subset of the W3C key event Android actually populates. */
export interface RemoteKeyEvent
  extends NativeSyntheticEvent<{ code: string; key: string }> {}

/**
 * `onKeyDown` and `onKeyUp` exist in React Native's JavaScript (see
 * Libraries/Components/View/ViewPropTypes.js, `KeyEventProps`) but are missing
 * from its TypeScript definitions in this version. Declaring them here is what
 * lets the player pass them to a View without a cast at every call site; delete
 * this block when the types catch up.
 */
declare module 'react-native' {
  interface ViewProps {
    onKeyDown?: (event: RemoteKeyEvent) => void;
    onKeyDownCapture?: (event: RemoteKeyEvent) => void;
    onKeyUp?: (event: RemoteKeyEvent) => void;
    onKeyUpCapture?: (event: RemoteKeyEvent) => void;
  }
}

/** What `useRemoteControl` hands back, to be spread onto a focused view. */
export interface RemoteKeyHandlers {
  onKeyDown: (event: RemoteKeyEvent) => void;
}

/** What a press means to the player, independent of which path reported it. */
export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'rewind'
  | 'fastForward'
  | 'menu'
  | 'info'
  | 'stop'
  | 'other';

/** W3C `code` -> action. Anything unlisted just wakes the overlay. */
export function actionForKeyCode(code: string): RemoteAction {
  switch (code) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Enter':
    case 'Space':
      return 'select';
    // Not produced by JSKeyDispatcher today, but harmless to accept: a keyboard
    // attached to a TV box, or a future keycode table, can send them.
    case 'MediaPlayPause':
      return 'playPause';
    case 'MediaPlay':
      return 'play';
    case 'MediaPause':
      return 'pause';
    case 'MediaRewind':
      return 'rewind';
    case 'MediaFastForward':
      return 'fastForward';
    default:
      return 'other';
  }
}

/** `useTVEventHandler`'s `eventType` -> the same action vocabulary. */
export function actionForHardwareEvent(eventType: string): RemoteAction {
  switch (eventType) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'playPause':
    case 'play':
    case 'pause':
    case 'rewind':
    case 'fastForward':
    case 'menu':
    case 'info':
    case 'stop':
      return eventType;
    case 'select':
      return 'select';
    default:
      return 'other';
  }
}
