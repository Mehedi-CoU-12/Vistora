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

  override fun getMainComponentName(): String = "Vistora"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    requestedOrientation = DeviceOrientation.restingPolicy(this)

    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      holdPlatformSplashUntilReactPaints()
    }
  }

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

  private fun reactHasPainted(content: ViewGroup): Boolean {
    val reactRoot = content.getChildAt(0) as? ViewGroup ?: return false
    return reactRoot.childCount > 0
  }

  private companion object {
    /** Longest the splash may be held before it is released regardless. */
    const val SPLASH_CEILING_MS = 8_000L
  }
}
