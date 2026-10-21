# Proguard rules for THANGAM STORES WebView app
# Preserve WebView-related classes
-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public *;
}

# Preserve JavaScript interface bindings
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX Browser (Custom Tabs)
-keep class androidx.browser.** { *; }

# Material Components
-keep class com.google.android.material.** { *; }
