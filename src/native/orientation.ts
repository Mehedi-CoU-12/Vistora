import { NativeModules } from 'react-native';













interface OrientationNative {
  lockLandscape(): void;
  release(): void;
}










const native = NativeModules.VistoraOrientation as
  | OrientationNative
  | undefined;


export const canControlOrientation = native != null;


export function lockLandscape(): void {
  native?.lockLandscape();
}


export function releaseOrientation(): void {
  native?.release();
}
