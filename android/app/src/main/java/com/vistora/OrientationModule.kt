package com.vistora

import android.app.Activity
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule


@ReactModule(name = OrientationModule.NAME)
class OrientationModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun lockLandscape() {
    withActivity { it.requestedOrientation = DeviceOrientation.VIDEO_POLICY }
  }

  /** Hand orientation back to the device's resting policy for this hardware. */
  @ReactMethod
  fun release() {
    withActivity { it.requestedOrientation = DeviceOrientation.restingPolicy(it) }
  }

  private fun withActivity(block: (Activity) -> Unit) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread { block(activity) }
  }

  companion object {
    const val NAME = "VistoraOrientation"
  }
}
