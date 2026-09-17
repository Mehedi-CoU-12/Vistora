package com.vistora

import android.app.UiModeManager
import android.content.Context
import android.content.pm.ActivityInfo
import android.content.res.Configuration

internal object DeviceOrientation {

  fun isTelevision(context: Context): Boolean {
    val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
  }

  fun restingPolicy(context: Context): Int =
      if (isTelevision(context)) {
        ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
      } else {
        ActivityInfo.SCREEN_ORIENTATION_USER
      }

  const val VIDEO_POLICY = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
}
