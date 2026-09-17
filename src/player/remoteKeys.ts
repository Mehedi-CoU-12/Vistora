import type { NativeSyntheticEvent } from 'react-native';

export interface RemoteKeyEvent
  extends NativeSyntheticEvent<{ code: string; key: string }> {}

declare module 'react-native' {
  interface ViewProps {
    onKeyDown?: (event: RemoteKeyEvent) => void;
    onKeyDownCapture?: (event: RemoteKeyEvent) => void;
    onKeyUp?: (event: RemoteKeyEvent) => void;
    onKeyUpCapture?: (event: RemoteKeyEvent) => void;
  }
}

export interface RemoteKeyHandlers {
  onKeyDown: (event: RemoteKeyEvent) => void;
}

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
