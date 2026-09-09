import { NativeModules } from 'react-native';

/**
 * Orientation control, for the one screen that needs it.
 *
 * Browsing follows the device: portrait in an upright hand, landscape when turned, and it
 * honours the owner's rotation lock. A video is the exception. A 16:9 stream in a portrait
 * window is a band across the middle of the screen with two thirds of the display unused, so
 * opening the player asks for landscape and closing it gives orientation back.
 *
 * The native side is `android/app/src/main/java/com/vistora/OrientationModule.kt`, which is
 * two calls to `setRequestedOrientation`. See the comment there for why this is a hand-written
 * module rather than an orientation library.
 */
interface OrientationNative {
  lockLandscape(): void;
  release(): void;
}

/**
 * Resolved once, and allowed to be missing.
 *
 * A native module only exists in a binary that was rebuilt after it was added, so during
 * development the JS bundle can easily be newer than the installed APK -- a Fast Refresh after
 * `git pull`, or Metro serving a phone that has yesterday's build. Optional-chaining every
 * call means that mismatch costs a video its landscape lock, rather than throwing
 * `Cannot read property 'lockLandscape' of undefined` and taking down the player.
 */
const native = NativeModules.VistoraOrientation as
  | OrientationNative
  | undefined;

/** True when the native module is present, i.e. when these calls will do anything. */
export const canControlOrientation = native != null;

/** Hold the display landscape, whichever way up the device is held. */
export function lockLandscape(): void {
  native?.lockLandscape();
}

/** Hand orientation back to whatever this device's resting policy is. */
export function releaseOrientation(): void {
  native?.release();
}
