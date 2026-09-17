# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.react.bridge.ReactMethod

-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}

-keep class com.vistora.** { *; }

-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class * implements com.facebook.react.ReactPackage { *; }

-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
