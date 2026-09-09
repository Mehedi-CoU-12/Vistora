package com.vistora

import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.res.Configuration
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
   * This is the one piece of the responsive story that cannot live in JavaScript or in a
   * resource file. `android:screenOrientation` is a single static manifest attribute: it
   * takes no resource qualifier, so there is no `values-television` trick for it, and the
   * same APK installs on a TV and on a phone. So the choice is made here, once, at startup:
   *
   *   TV      LANDSCAPE. A television is landscape and nothing else, and pinning it means
   *           no stray sensor reading or `adb shell` rotation can ever hand a 10-foot UI a
   *           portrait window it was never designed for.
   *
   *   Phone   USER, which honours the rotation lock in the owner's quick settings. So the
   *           app opens portrait in an upright hand, fills the screen when turned, and
   *           stays put for someone who has locked rotation on purpose. FULL_SENSOR would
   *           override that lock, which is not ours to override.
   *
   * Set before `super.onCreate` so the window is created with its final orientation. Doing
   * it afterwards would let the first frame lay out at the wrong aspect ratio and then
   * reflow, which on a phone is a visible flash of the wrong layout.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    requestedOrientation =
        if (isTelevision()) {
          ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
          ActivityInfo.SCREEN_ORIENTATION_USER
        }

    super.onCreate(savedInstanceState)
  }

  /**
   * Exactly the test React Native uses for `Platform.isTV` on Android -- see
   * AndroidInfoModule.uiMode(), which reports "tv" for this same constant.
   *
   * Matching it is the point rather than a coincidence: JavaScript branches its whole
   * layout on `Platform.isTV` (src/theme/metrics.ts), so if native decided "TV" by some
   * other signal -- FEATURE_LEANBACK, say, which a phone can report and a Fire TV can
   * omit -- a device could end up with a landscape lock and a phone layout, or the
   * reverse. One signal, two readers.
   */
  private fun isTelevision(): Boolean {
    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
  }
}
