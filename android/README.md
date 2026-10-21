# THANGAM STORES — Android App

A native Android WebView wrapper that loads the THANGAM STORES customer storefront.

## Technical Details

| Property | Value |
|---|---|
| Application ID | `com.thangamstores.app` |
| Min SDK | 23 (Android 6.0 Marshmallow) |
| Target SDK | 34 (Android 14) |
| Storefront URL | `https://ecommerce-storefront-client.vercel.app` |

## Features

- **WebView** loads the live Vercel-hosted storefront
- **Swipe-to-refresh** to reload the page
- **Android back navigation** navigates back in WebView history
- **Loading overlay** shown while page is loading
- **Network error screen** with retry button
- **Google Sign-in via Custom Tabs** — opens Google OAuth in the system browser so authentication works correctly (avoids WebView restriction on `accounts.google.com`)
- **Firebase Auth session persistence** via cookie sync and DOM storage
- **External links** open in the default browser
- **HTTPS enforced** — cleartext traffic is disabled

## Prerequisites

Before building, ensure you have:

1. **Android Studio** (latest stable — Hedgehog or newer): https://developer.android.com/studio
2. **Java 17+** — already detected at `C:\Program Files\Eclipse Adoptium\jdk-25.0.1.8-hotspot`
3. **Android SDK** — installed automatically via Android Studio

## Building the Debug APK

### Option A — Android Studio (Recommended)

1. Open Android Studio
2. Click **File → Open** and select this `android/` folder
3. Wait for Gradle sync to complete (downloads dependencies automatically)
4. Click **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

### Option B — Command Line (Gradle Wrapper)

Open a terminal in the `android/` directory:

```cmd
cd c:\Users\akash\OneDrive\Desktop\EMS\android
gradlew.bat assembleDebug
```

APK output: `app\build\outputs\apk\debug\app-debug.apk`

> **Note:** The Gradle wrapper (`gradlew.bat`) automatically downloads Gradle 8.7 and the Android build tools on first run. This requires an internet connection and ~500MB of disk space.

## Installing on a Physical Android Phone

1. **Enable Developer Options** on your phone:
   - Go to **Settings → About Phone**
   - Tap **Build Number** 7 times until "Developer mode enabled" appears

2. **Enable USB Debugging**:
   - Go to **Settings → Developer Options**
   - Toggle **USB Debugging** ON

3. **Install via ADB** (if Android SDK is installed):
   ```cmd
   adb install app\build\outputs\apk\debug\app-debug.apk
   ```

4. **Install via file transfer** (no ADB needed):
   - Copy the APK file to your phone via USB or cloud storage
   - On the phone, navigate to the APK file and tap it
   - Allow "Install from unknown sources" when prompted
   - Tap **Install**

## Google Sign-in Notes

Google Sign-in is handled via **Chrome Custom Tabs** instead of directly inside the WebView. This is required because Google blocks OAuth in embedded WebViews for security reasons.

When the user taps "Sign in with Google":
1. The app opens Chrome Custom Tabs (not a new browser window)
2. The user authenticates with Google
3. Firebase Auth redirects back to the storefront URL
4. The WebView resumes with the authenticated session intact

No Firebase credentials are exposed in the app. The same Firebase project and Firestore database as the website is used.

## Project Structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/thangamstores/app/
│   │   │   ├── MainActivity.java        ← WebView host
│   │   │   └── SplashActivity.java      ← Launch screen
│   │   └── res/
│   │       ├── layout/
│   │       │   ├── activity_main.xml    ← WebView + overlays
│   │       │   └── activity_splash.xml  ← Splash branding
│   │       ├── values/
│   │       │   ├── strings.xml          ← App name: THANGAM STORES
│   │       │   ├── colors.xml           ← Emerald brand colours
│   │       │   └── themes.xml           ← Material theme
│   │       └── drawable/
│   │           ├── ic_launcher_foreground.xml
│   │           └── splash_logo_bg.xml
│   ├── build.gradle
│   └── proguard-rules.pro
├── gradle/wrapper/
│   └── gradle-wrapper.properties        ← Auto-downloads Gradle 8.7
├── build.gradle
├── settings.gradle
└── gradlew.bat                          ← Windows build script
```
