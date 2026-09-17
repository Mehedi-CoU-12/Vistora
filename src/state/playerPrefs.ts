import {
  DEFAULT_SEEK_GESTURE_SPEED,
  DEFAULT_SKIP_STEP,
  DEFAULT_SUBTITLE_LIFT,
  DEFAULT_SUBTITLE_OPACITY,
  DEFAULT_SUBTITLE_SIZE,
  type ScalingMode,
  type SeekGestureSpeed,
  type SkipStep,
} from '../player/playbackOptions';
import { createStore, useStore } from './store';

export interface PlayerPrefs {
  skipStep: SkipStep;

  seekSpeed: SeekGestureSpeed;

  scaling: ScalingMode;

  subtitleSize: number;
  subtitleLift: number;
  subtitleOpacity: number;

  keepDeviceVolume: boolean;

  autoplayNext: boolean;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = {
  skipStep: DEFAULT_SKIP_STEP,
  seekSpeed: DEFAULT_SEEK_GESTURE_SPEED,
  scaling: 'fit',
  subtitleSize: DEFAULT_SUBTITLE_SIZE,
  subtitleLift: DEFAULT_SUBTITLE_LIFT,
  subtitleOpacity: DEFAULT_SUBTITLE_OPACITY,
  keepDeviceVolume: false,
  autoplayNext: true,
};

const store = createStore<PlayerPrefs>(DEFAULT_PLAYER_PREFS);

export function setPlayerPref<K extends keyof PlayerPrefs>(
  key: K,
  value: PlayerPrefs[K],
): void {
  const current = store.get();

  if (current[key] === value) {
    return;
  }

  store.set({ ...current, [key]: value });
}

export function resetPlayerPrefs(): void {
  store.set(DEFAULT_PLAYER_PREFS);
}

export function isDefaultPlayerPrefs(prefs: PlayerPrefs): boolean {
  return (Object.keys(DEFAULT_PLAYER_PREFS) as (keyof PlayerPrefs)[]).every(
    key => prefs[key] === DEFAULT_PLAYER_PREFS[key],
  );
}

export function getPlayerPrefs(): PlayerPrefs {
  return store.get();
}

export function usePlayerPrefs(): PlayerPrefs {
  return useStore(store);
}
