package com.vistora

import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.res.Configuration

/**
 * The app's orientation policy, in one place.
 *
 * Three callers need to agree about this and would drift apart if each decided for itself:
 * MainActivity picks the resting policy at startup, OrientationModule overrides it while a
 * video is on screen and restores it afterwards, and JavaScript branches its whole layout on
 * `Platform.isTV`. Extracting it means "what counts as a television" is answered once.
 */
internal object DeviceOrientation {

  /**
   * Exactly the test React Native uses for `Platform.isTV` on Android -- see
   * AndroidInfoModule.uiMode(), which reports "tv" for this same constant.
   *
   * Matching it is the point rather than a coincidence. If native decided "TV" by some other
   * signal -- FEATURE_LEANBACK, say, which a phone can report and a Fire TV can omit -- a
   * device could end up with a landscape lock and a phone layout, or the reverse.
   */
  fun isTelevision(context: Context): Boolean {
    val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
  }

  /**
   * What the activity requests when nothing is playing.
   *
   *   TV      LANDSCAPE. A television is landscape and nothing else, and pinning it means no
   *           stray sensor reading or `adb shell` rotation can hand a 10-foot UI a portrait
   *           window it was never designed for.
   *
   *   Phone   USER, which honours the rotation lock in the owner's quick settings. So browsing
   *           happens portrait in an upright hand, fills the screen when turned, and stays put
   *           for someone who has locked rotation on purpose.
   */
  fun restingPolicy(context: Context): Int =
      if (isTelevision(context)) {
        ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
      } else {
        ActivityInfo.SCREEN_ORIENTATION_USER
      }

  /**
   * What the activity requests while a video is on screen, on a touch device.
   *
   * SENSOR_LANDSCAPE rather than LANDSCAPE so the phone can be held either way up -- a viewer
   * who turns it the "wrong" way gets a correct picture instead of an upside-down one.
   *
   * It deliberately overrides the user's rotation lock, which `restingPolicy` respects. That
   * is the one place in the app where doing so is right: a locked-portrait phone would
   * otherwise show a 16:9 film as a band across the middle of the screen, which is the exact
   * complaint this policy exists to answer.
   */
  const val VIDEO_POLICY = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
}
