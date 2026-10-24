package com.thangamstores.app;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.snackbar.Snackbar;

import java.io.File;
import java.io.IOException;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "MainActivity";

    // Dynamic start URL and host based on active flavor (storefront vs admin)
    private static final String STOREFRONT_URL = BuildConfig.START_URL;
    private static final String STOREFRONT_HOST = BuildConfig.START_HOST;

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private View loadingOverlay;
    private View errorOverlay;
    private boolean hasError = false;

    // Multi-window popup dialog for Google OAuth / Firebase Auth popups
    private Dialog popupDialog;
    private WebView popupWebView;
    private ProgressBar popupProgressBar;

    // File chooser callback for uploading product photos
    private ValueCallback<Uri[]> uploadMessage;
    private Uri cameraCaptureUri;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (uploadMessage == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK) {
                    Intent data = result.getData();
                    if (data != null) {
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            results = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                results[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        } else if (data.getData() != null) {
                            results = new Uri[]{data.getData()};
                        }
                    } else if (cameraCaptureUri != null) {
                        // User took a photo with the camera
                        results = new Uri[]{cameraCaptureUri};
                    }
                }
                uploadMessage.onReceiveValue(results);
                uploadMessage = null;
                cameraCaptureUri = null;
            });

    // Network connectivity listener for seamless offline-to-online recovery
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        loadingOverlay = findViewById(R.id.loadingOverlay);
        errorOverlay = findViewById(R.id.errorOverlay);

        setupBackNavigation();
        setupNetworkMonitoring();

        // Configure cookies — essential for Firebase Auth session persistence
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // ── WebView Settings & Security Hardening ──────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);       // Firebase Auth uses localStorage & IndexedDB
        settings.setDatabaseEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Cache mode: standard HTTP cache for fast rendering without stale order state
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Security controls: strictly forbid insecure file access from web schemes
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Multi-window support so Firebase signInWithPopup opens gracefully in-app
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        // Clean modern mobile Chrome User-Agent without WebView indicators (; wv, Version/4.0)
        // Ensures Google OAuth permits in-app authentication without 403 disallowed_useragent
        String rawUa = settings.getUserAgentString();
        String cleanUa = rawUa.replaceAll(";\\s*wv", "")
                .replaceAll("Version/\\d+\\.\\d+\\s*", "")
                .replaceAll(";\\s*U;", ";");
        settings.setUserAgentString(cleanUa);

        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        // ── WebViewClient — Navigation & Error Handling ───────────
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrlLoading(view, request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url == null) return false;
                return handleUrlLoading(view, Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                hasError = false;
                showLoading(true);
                hideError();
                updateSwipeRefreshState(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                showLoading(false);
                swipeRefresh.setRefreshing(false);
                CookieManager.getInstance().flush();
                if (!hasError) {
                    hideError();
                }
                updateSwipeRefreshState(url);
                // Signal to web app that it is running inside the native Android wrapper
                view.evaluateJavascript("window.isEMSApp = true; window.EMS_NATIVE_APP = true;", null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Handle main-frame navigation failures with safe offline screen
                if (request.isForMainFrame()) {
                    hasError = true;
                    showLoading(false);
                    swipeRefresh.setRefreshing(false);
                    showError();
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Strict SSL security: Never bypass SSL certificate validation
                Log.e(TAG, "SSL Certificate Error encountered: " + error.toString());
                handler.cancel();
                hasError = true;
                showLoading(false);
                swipeRefresh.setRefreshing(false);
                showError();
            }
        });

        // ── WebChromeClient — Popup Windows, Progress, Image File Selection ──
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return false;
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (popupDialog != null && popupDialog.isShowing()) {
                    popupDialog.dismiss();
                }

                popupWebView = new WebView(MainActivity.this);
                WebSettings popupSettings = popupWebView.getSettings();
                popupSettings.setJavaScriptEnabled(true);
                popupSettings.setDomStorageEnabled(true);
                popupSettings.setDatabaseEnabled(true);
                popupSettings.setSupportMultipleWindows(true);
                popupSettings.setJavaScriptCanOpenWindowsAutomatically(true);
                popupSettings.setUserAgentString(cleanUa);
                popupSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
                popupSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

                CookieManager.getInstance().setAcceptCookie(true);
                CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

                // Container with a thin loading progress bar at the top
                RelativeLayout popupContainer = new RelativeLayout(MainActivity.this);
                popupContainer.setLayoutParams(new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                popupContainer.addView(popupWebView, new RelativeLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                popupProgressBar = new ProgressBar(MainActivity.this, null, android.R.attr.progressBarStyleHorizontal);
                popupProgressBar.setIndeterminate(true);
                popupProgressBar.setVisibility(View.VISIBLE);
                RelativeLayout.LayoutParams progressLp = new RelativeLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, 8);
                progressLp.addRule(RelativeLayout.ALIGN_PARENT_TOP);
                popupContainer.addView(popupProgressBar, progressLp);

                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        return handleUrlLoading(view, request.getUrl());
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url == null) return false;
                        return handleUrlLoading(view, Uri.parse(url));
                    }

                    @Override
                    public void onPageStarted(WebView view, String url, Bitmap favicon) {
                        super.onPageStarted(view, url, favicon);
                        if (popupProgressBar != null) popupProgressBar.setVisibility(View.VISIBLE);
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        if (popupProgressBar != null) popupProgressBar.setVisibility(View.GONE);
                        CookieManager.getInstance().flush();
                    }

                    @Override
                    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                        handler.cancel();
                    }
                });

                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        dismissPopup();
                    }
                });

                popupDialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
                popupDialog.setContentView(popupContainer);
                if (popupDialog.getWindow() != null) {
                    popupDialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                }
                popupDialog.setOnDismissListener(dialog -> {
                    dismissPopup();
                });
                popupDialog.show();

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                dismissPopup();
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;

                try {
                    // Create capture intent for Camera
                    Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    File photoFile = createImageFile();
                    if (photoFile != null) {
                        cameraCaptureUri = FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                photoFile);
                        takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, cameraCaptureUri);
                    }

                    // Create file picker intent
                    Intent contentSelectionIntent = fileChooserParams.createIntent();

                    // Combine into system chooser so admin can either pick from gallery or take a photo
                    Intent[] intentArray = (photoFile != null) ? new Intent[]{takePictureIntent} : new Intent[0];
                    Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
                    chooserIntent.putExtra(Intent.EXTRA_INTENT, contentSelectionIntent);
                    chooserIntent.putExtra(Intent.EXTRA_TITLE, "Select Product Image");
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, intentArray);

                    fileChooserLauncher.launch(chooserIntent);
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "Error opening file chooser", e);
                    if (uploadMessage != null) {
                        uploadMessage.onReceiveValue(null);
                        uploadMessage = null;
                    }
                    return false;
                }
            }
        });

        // ── Swipe-to-refresh & Smooth Scroll Tuning ──────────────
        swipeRefresh.setColorSchemeResources(R.color.emerald_700);
        // Deliberate refresh distance to prevent accidental triggers during normal scrolling
        swipeRefresh.setDistanceToTriggerSync(350);

        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> {
            // If the WebView can scroll upwards or is scrolled down, child CAN scroll up -> do NOT refresh
            if (webView.canScrollVertically(-1) || webView.getScrollY() > 0) {
                return true;
            }
            // Disable pull-to-refresh on interaction-critical pages (checkout, invite acceptance, admin actions)
            String url = webView.getUrl();
            if (isCriticalInteractivePage(url)) {
                return true;
            }
            return false;
        });

        swipeRefresh.setOnRefreshListener(() -> {
            hasError = false;
            hideError();
            if (!isNetworkAvailable()) {
                swipeRefresh.setRefreshing(false);
                showError();
            } else {
                webView.reload();
            }
        });

        // ── Offline Error Overlay Controls ─────────────────────────
        View retryButton = errorOverlay.findViewById(R.id.retryButton);
        if (retryButton != null) {
            retryButton.setOnClickListener(v -> {
                hideError();
                if (isNetworkAvailable()) {
                    webView.reload();
                } else {
                    showError();
                    Snackbar.make(webView, "No internet connection detected. Please check network.",
                            Snackbar.LENGTH_SHORT).show();
                }
            });
        }

        View callStoreButton = errorOverlay.findViewById(R.id.callStoreButton);
        if (callStoreButton != null) {
            callStoreButton.setOnClickListener(v -> {
                try {
                    Intent callIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + getString(R.string.store_phone_number)));
                    startActivity(callIntent);
                } catch (Exception ignored) {}
            });
        }

        View goBackButton = errorOverlay.findViewById(R.id.goBackButton);
        if (goBackButton != null) {
            goBackButton.setOnClickListener(v -> {
                if (webView.canGoBack()) {
                    hideError();
                    webView.goBack();
                } else {
                    hideError();
                    webView.loadUrl(STOREFRONT_URL);
                }
            });
        }

        // ── Initial Page Load & Deep-Link Processing ───────────────
        String targetUrl = resolveDestinationUrl(getIntent());
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (isNetworkAvailable()) {
            webView.loadUrl(targetUrl);
        } else {
            showLoading(false);
            showError();
        }
    }

    // ── Deep-Link & Intent Handling ───────────────────────────────
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String targetUrl = resolveDestinationUrl(intent);
        if (targetUrl != null && webView != null) {
            hasError = false;
            hideError();
            webView.loadUrl(targetUrl);
        }
    }

    private String resolveDestinationUrl(Intent intent) {
        if (intent != null && intent.getData() != null) {
            Uri data = intent.getData();
            String host = data.getHost();
            String scheme = data.getScheme();

            // Direct HTTPS match for customer storefront or admin portal
            if ("https".equalsIgnoreCase(scheme) && host != null &&
                    (host.equals(STOREFRONT_HOST) || host.endsWith("." + STOREFRONT_HOST))) {
                return data.toString();
            }

            // Custom schemes: thangamstores:// or ems-admin://
            if ("thangamstores".equalsIgnoreCase(scheme) || "ems-admin".equalsIgnoreCase(scheme)) {
                String path = data.getPath() != null ? data.getPath() : "";
                String query = data.getQuery() != null ? "?" + data.getQuery() : "";
                return STOREFRONT_URL.replaceAll("/$", "") + path + query;
            }
        }
        return STOREFRONT_URL;
    }

    private boolean isCriticalInteractivePage(String url) {
        if (url == null) return false;
        return url.contains("/accept-invite") ||
               url.contains("/login") ||
               url.contains("/checkout") ||
               url.contains("/order-confirmation") ||
               url.contains("/admin-users");
    }

    private void updateSwipeRefreshState(String url) {
        if (swipeRefresh == null) return;
        swipeRefresh.setEnabled(!isCriticalInteractivePage(url));
    }

    // ── Modern Back Navigation ────────────────────────────────────
    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // 1. Popup Google OAuth dialog back handling
                if (popupDialog != null && popupDialog.isShowing()) {
                    if (popupWebView != null && popupWebView.canGoBack()) {
                        popupWebView.goBack();
                        return;
                    }
                    dismissPopup();
                    return;
                }

                // 2. Recoverable error screen back navigation
                if (errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
                    if (webView.canGoBack()) {
                        hideError();
                        webView.goBack();
                        return;
                    }
                }

                // 3. In-WebView history navigation
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                // 4. Default back activity action
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    // ── Internal and Auth Domain Classification ──────────────────
    private boolean isInternalOrAuthUrl(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase();

        // 1. Internal storefront / admin domains & Vercel deployments
        if (host.equals(STOREFRONT_HOST) || host.endsWith("." + STOREFRONT_HOST)) {
            return true;
        }
        if (host.endsWith(".vercel.app")) {
            return true;
        }

        // 2. Google OAuth & Identity authentication endpoints
        if (host.equals("accounts.google.com") ||
            host.endsWith(".accounts.google.com") ||
            host.equals("google.com") ||
            host.endsWith(".google.com") ||
            host.contains(".google.co.") ||
            host.contains("googleusercontent.com") ||
            host.equals("googleapis.com") ||
            host.endsWith(".googleapis.com") ||
            host.equals("gstatic.com") ||
            host.endsWith(".gstatic.com")) {
            return true;
        }

        // 3. Firebase Auth & Hosting handler domains
        if (host.equals("firebaseapp.com") ||
            host.endsWith(".firebaseapp.com") ||
            host.equals("web.app") ||
            host.endsWith(".web.app")) {
            return true;
        }

        return false;
    }

    private boolean handleUrlLoading(WebView view, Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();

        // 1. Telephony and mail schemes
        if ("tel".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme)) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
            } catch (Exception ignored) {}
            return true;
        }

        // 2. Internal app navigation & Google/Firebase Auth flows — strictly keep inside WebView / popup WebView
        if (isInternalOrAuthUrl(uri)) {
            return false; // let the WebView load it internally
        }

        // 3. Open third-party external links safely in Custom Tabs / system browser
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            openInCustomTabOrBrowser(uri);
            return true;
        }

        return false;
    }

    private void dismissPopup() {
        if (popupDialog != null && popupDialog.isShowing()) {
            popupDialog.dismiss();
        }
        if (popupWebView != null) {
            final WebView webViewToDestroy = popupWebView;
            popupWebView = null;
            // Delay destruction slightly to allow pending window.opener.postMessage to dispatch
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    webViewToDestroy.destroy();
                } catch (Exception ignored) {}
            }, 500);
        }
        popupProgressBar = null;
    }

    // ── File Management for Camera Uploads ────────────────────────
    private File createImageFile() {
        try {
            File storageDir = new File(getCacheDir(), "camera_photos");
            if (!storageDir.exists()) {
                storageDir.mkdirs();
            }
            return File.createTempFile("EMS_IMG_", ".jpg", storageDir);
        } catch (IOException e) {
            Log.e(TAG, "Failed to create temporary camera image file", e);
            return null;
        }
    }

    // ── Custom Tabs or System Browser Launcher ────────────────────
    private void openInCustomTabOrBrowser(Uri uri) {
        try {
            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build();
            customTabsIntent.launchUrl(this, uri);
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
            } catch (Exception ignored) {}
        }
    }

    // ── Network State & Auto-Recovery ─────────────────────────────
    private void setupNetworkMonitoring() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
                runOnUiThread(() -> {
                    // Only auto-retry reload if we were currently displaying the error screen
                    if (hasError && errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
                        hasError = false;
                        hideError();
                        webView.reload();
                    }
                });
            }
        };

        try {
            connectivityManager.registerNetworkCallback(request, networkCallback);
        } catch (Exception e) {
            Log.w(TAG, "Could not register network callback", e);
        }
    }

    private boolean isNetworkAvailable() {
        if (connectivityManager == null) {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        }
        if (connectivityManager == null) return false;
        Network activeNetwork = connectivityManager.getActiveNetwork();
        if (activeNetwork == null) return false;
        NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(activeNetwork);
        return caps != null && (
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    // ── Activity Lifecycle Integration ────────────────────────────
    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        dismissPopup();
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    // ── UI Visibility Helpers ─────────────────────────────────────
    private void showLoading(boolean show) {
        if (loadingOverlay != null) {
            loadingOverlay.setVisibility(show ? View.VISIBLE : View.GONE);
        }
    }

    private void showError() {
        if (errorOverlay != null) {
            errorOverlay.setVisibility(View.VISIBLE);
        }
    }

    private void hideError() {
        if (errorOverlay != null) {
            errorOverlay.setVisibility(View.GONE);
        }
    }
}
