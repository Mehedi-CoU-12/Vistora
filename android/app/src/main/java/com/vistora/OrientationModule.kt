package com.vistora

import android.app.Activity
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

/**
 * Lets the player ask for landscape while a video is on screen, and give it back afterwards.
 *
 * Why this needs native code at all: orientation is an Activity property, and nothing in
 * React Native exposes it. The alternative was a third-party orientation library, which is a
 * poor trade here -- it would be the project's only native dependency that has to be
 * re-verified against the react-native-tvos fork on every bump, in exchange for two lines of
 * `setRequestedOrientation` that are stable Android API.
 *
 * The module is deliberately dumb: it has no idea a video exists, only "prefer landscape now"
 * and "go back to normal". The decision of when lives in PlayerScreen, which is the screen
 * that knows a player is mounted.
 */
@ReactModule(name = OrientationModule.NAME)
class OrientationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  /** Hold the display landscape, whichever way up the device is. */
  @ReactMethod
  fun lockLandscape() {
    withActivity { it.requestedOrientation = DeviceOrientation.VIDEO_POLICY }
  }

  /** Hand orientation back to the device's resting policy for this hardware. */
  @ReactMethod
  fun release() {
    withActivity { it.requestedOrientation = DeviceOrientation.restingPolicy(it) }
  }

  /**
   * The activity is null whenever it is gone -- backgrounded, or torn down while a JS timer
   * was still in flight -- so both entry points tolerate it rather than throwing into a
   * promise nobody awaits. There is nothing to orient in that case anyway.
   *
   * Read through `reactApplicationContext` rather than the module's own
   * `getCurrentActivity()`, which is deprecated as of React Native 0.80.
   *
   * `setRequestedOrientation` mutates the window, so it has to run on the UI thread; a
   * @ReactMethod arrives on the native modules thread.
   */
  private fun withActivity(block: (Activity) -> Unit) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { block(activity) }
  }

  companion object {
    const val NAME = "VistoraOrientation"
  }
}
