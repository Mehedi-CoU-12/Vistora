package com.vistora

import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.RequiresApi
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

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      holdPlatformSplashUntilReactPaints()
    }
  }

  /**
   * Keeps the Android 12+ platform splash on screen until React has actually drawn
   * something, then takes it away in one cut.
   *
   * ---------------------------------------------------------------------------
   * Why this exists: the platform's own fade-out is a visible flicker
   * ---------------------------------------------------------------------------
   * From targetSdk 31 the platform draws a splash at every cold start and dismisses
   * it, with a fade, as soon as the activity's first frame lands. On React Native
   * that first frame is nowhere near ready -- the JS bundle has not finished
   * loading -- so the splash fades out over an app that has nothing to show. A
   * frame-by-frame capture of the launch showed the logo drop to almost nothing and
   * then snap back to full strength one frame later, which is what "the logo shows
   * twice" actually is.
   *
   * Taking over the exit listener changes the contract: the splash view now stays
   * up until we call [android.window.SplashScreenView.remove], and calling it
   * removes the view immediately with no animation. So the logo holds still through
   * the entire load and is replaced by the finished UI in a single frame. Nothing
   * fades, nothing reappears, and there is no gap to cover.
   *
   * The signal is the React root view -- the sole child of android.R.id.content --
   * gaining children of its own, checked on each pre-draw. Before JS renders it is
   * an empty container, so this cannot fire early.
   *
   * [SPLASH_CEILING_MS] is the safety net, and it is not optional: while the exit
   * listener holds the view, nothing else will ever remove it, so a JS bundle that
   * fails to load would leave the splash up forever and the app looking hung. On
   * the ceiling we release regardless and the plain window background from
   * values-v31 shows through -- worse looking, but never stuck.
   */
  @RequiresApi(Build.VERSION_CODES.S)
  private fun holdPlatformSplashUntilReactPaints() {
    splashScreen.setOnExitAnimationListener { splashView ->
      val content = findViewById<ViewGroup>(android.R.id.content)
      var released = false

      fun release() {
        if (released) return
        released = true
        splashView.remove()
      }

      // Never hold a splash over an app that already has something on screen.
      //
      // This listener only fires when the platform actually presented a splash,
      // which it does for launches, not for in-place reconfiguration -- and PiP
      // enter/exit only changes configuration this activity already handles, so it
      // does not recreate. But if any path ever did arrive here warm, holding
      // would put the splash over live content, which on a returning player would
      // be a splash over playing video. Releasing immediately when React has
      // already painted costs one check and removes that whole class of outcome.
      //
      // Note this is a check for "already painted", not for "recreated". A warm
      // relaunch from the launcher does show a splash and does often carry saved
      // instance state, and there the hold is exactly what is wanted: gating on
      // savedInstanceState instead would skip it and let the fade back in.
      if (reactHasPainted(content)) {
        release()
        return@setOnExitAnimationListener
      }

      val onPreDraw =
          object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
              if (reactHasPainted(content)) {
                content.viewTreeObserver.removeOnPreDrawListener(this)
                release()
              }
              return true
            }
          }

      content.viewTreeObserver.addOnPreDrawListener(onPreDraw)
      content.postDelayed(
          {
            content.viewTreeObserver.removeOnPreDrawListener(onPreDraw)
            release()
          },
          SPLASH_CEILING_MS,
      )
    }
  }

  /**
   * True once the React root view holds at least one child.
   *
   * Only the direct child of the content view is inspected, rather than the tree
   * being walked for anything that looks rendered. A walk would also find the dev
   * server's "Loading from localhost:8081" banner in debug builds and release the
   * splash before any app UI existed.
   */
  private fun reactHasPainted(content: ViewGroup): Boolean {
    val reactRoot = content.getChildAt(0) as? ViewGroup ?: return false
    return reactRoot.childCount > 0
  }

  private companion object {
    /** Longest the splash may be held before it is released regardless. */
    const val SPLASH_CEILING_MS = 8_000L
  }
}
