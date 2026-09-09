package com.vistora

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Vistora"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Picks the orientation policy for the device this APK happens to be running on.
   *
   * This cannot live in JavaScript or in a resource file. `android:screenOrientation` is a
   * single static manifest attribute: it takes no resource qualifier, so there is no
   * `values-television` trick for it, and the same APK installs on a TV and on a phone. So the
   * choice is made here, once, at startup -- see [DeviceOrientation.restingPolicy] for what is
   * chosen and why.
   *
   * "Resting" because it is not the last word: [OrientationModule] overrides it with landscape
   * while a video is on screen, and restores it from the same helper afterwards.
   *
   * Set before `super.onCreate` so the window is created with its final orientation. Doing it
   * afterwards would let the first frame lay out at the wrong aspect ratio and then reflow,
   * which on a phone is a visible flash of the wrong layout.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    requestedOrientation = DeviceOrientation.restingPolicy(this)

    super.onCreate(savedInstanceState)
  }
}
