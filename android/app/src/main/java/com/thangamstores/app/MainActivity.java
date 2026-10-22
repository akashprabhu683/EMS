package com.thangamstores.app;

import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.snackbar.Snackbar;

public class MainActivity extends AppCompatActivity {

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

    // File chooser callback for uploading product photos
    private ValueCallback<Uri[]> uploadMessage;
    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (uploadMessage == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    if (result.getData().getClipData() != null) {
                        int count = result.getData().getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = result.getData().getClipData().getItemAt(i).getUri();
                        }
                    } else if (result.getData().getData() != null) {
                        results = new Uri[]{result.getData().getData()};
                    }
                }
                uploadMessage.onReceiveValue(results);
                uploadMessage = null;
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        loadingOverlay = findViewById(R.id.loadingOverlay);
        errorOverlay = findViewById(R.id.errorOverlay);

        // Configure cookies — needed for Firebase Auth session persistence
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        // ── WebView settings ──────────────────────────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);       // Firebase Auth uses localStorage / IndexedDB
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Enable multiple windows so Firebase signInWithPopup works natively in-app
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        // Clean modern mobile Chrome User-Agent without WebView identifiers (; wv, Version/4.0)
        // This ensures Google OAuth permits in-app authentication without 403 disallowed_useragent
        String rawUa = settings.getUserAgentString();
        String cleanUa = rawUa.replaceAll(";\\s*wv", "").replaceAll("Version/\\d+\\.\\d+\\s*", "");
        settings.setUserAgentString(cleanUa);

        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        // ── WebViewClient — handle navigation ─────────────────────
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                String scheme = uri.getScheme();

                // 1. Allow internal storefront/admin domain navigation
                if (host != null && (host.equals(STOREFRONT_HOST) || host.endsWith("." + STOREFRONT_HOST))) {
                    return false; // let WebView handle it
                }

                // 2. Allow Google OAuth & Firebase Auth domains to proceed inside WebView / popup
                // This ensures sessionStorage and window.opener relationships remain intact!
                if (host != null && (
                        host.equals("accounts.google.com") ||
                        host.endsWith(".google.com") ||
                        host.equals("firebaseapp.com") ||
                        host.endsWith(".firebaseapp.com"))) {
                    return false; // let WebView / popup handle it directly
                }

                // 3. Handle device protocols (phone calls, email links)
                if ("tel".equals(scheme) || "mailto".equals(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                    return true;
                }

                // 4. Open external third-party links in system browser
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        if (intent.resolveActivity(getPackageManager()) != null) {
                            startActivity(intent);
                        }
                    } catch (Exception ignored) {}
                    return true;
                }

                return false;
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
                // Sync cookies after every page load
                CookieManager.getInstance().flush();
                if (!hasError) {
                    hideError();
                }
                updateSwipeRefreshState(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Only handle main frame errors — ignore sub-resource failures
                if (request.isForMainFrame()) {
                    hasError = true;
                    showLoading(false);
                    swipeRefresh.setRefreshing(false);
                    showError();
                }
            }
        });

        // ── WebChromeClient — title, progress, multi-window & file upload support ──
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return false; // suppress console noise in production
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

                CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);

                popupWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        // Keep auth in popup WebView
                        return false;
                    }
                });

                popupWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        if (popupDialog != null && popupDialog.isShowing()) {
                            popupDialog.dismiss();
                        }
                        if (popupWebView != null) {
                            popupWebView.destroy();
                            popupWebView = null;
                        }
                    }
                });

                popupDialog = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_Light_NoActionBar);
                popupDialog.setContentView(popupWebView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                popupDialog.setOnDismissListener(dialog -> {
                    if (popupWebView != null) {
                        popupWebView.destroy();
                        popupWebView = null;
                    }
                });
                popupDialog.show();

                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                if (popupDialog != null && popupDialog.isShowing()) {
                    popupDialog.dismiss();
                }
                if (popupWebView != null) {
                    popupWebView.destroy();
                    popupWebView = null;
                }
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
                    Intent intent = fileChooserParams.createIntent();
                    fileChooserLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    uploadMessage = null;
                    return false;
                }
            }
        });

        // ── Swipe-to-refresh & child scroll handling ─────────────
        swipeRefresh.setColorSchemeResources(R.color.emerald_700);

        // Intelligently check if the WebView can scroll upwards before triggering pull-to-refresh
        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> {
            // If the content is scrolled down, child CAN scroll up -> do not trigger pull to refresh!
            if (webView.canScrollVertically(-1)) {
                return true;
            }
            // If we are on an invitation or authentication page, disable pull-to-refresh completely
            String url = webView.getUrl();
            if (url != null && (
                    url.contains("/accept-invite") ||
                    url.contains("/login") ||
                    url.contains("/checkout") ||
                    url.contains("/profile"))) {
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

        // ── Retry button ─────────────────────────────────────────
        View retryButton = errorOverlay.findViewById(R.id.retryButton);
        if (retryButton != null) {
            retryButton.setOnClickListener(v -> {
                hideError();
                if (isNetworkAvailable()) {
                    webView.reload();
                } else {
                    showError();
                    Snackbar.make(webView, "No internet connection. Please check your network.",
                            Snackbar.LENGTH_SHORT).show();
                }
            });
        }

        // ── Initial load ─────────────────────────────────────────
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else if (isNetworkAvailable()) {
            webView.loadUrl(STOREFRONT_URL);
        } else {
            showLoading(false);
            showError();
        }
    }

    private void updateSwipeRefreshState(String url) {
        if (swipeRefresh == null) return;
        if (url != null && (
                url.contains("/accept-invite") ||
                url.contains("/login") ||
                url.contains("/checkout") ||
                url.contains("/profile"))) {
            swipeRefresh.setEnabled(false);
        } else {
            swipeRefresh.setEnabled(true);
        }
    }

    // ── Back navigation inside WebView ────────────────────────────
    @Override
    public void onBackPressed() {
        if (popupDialog != null && popupDialog.isShowing()) {
            popupDialog.dismiss();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ── Save WebView state on rotation ───────────────────────────
    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    // ── Pause / Resume WebView with lifecycle ─────────────────────
    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        // Sync cookies when returning from Custom Tabs (OAuth redirect)
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
        CookieManager.getInstance().flush();
    }

    // ── Network check ─────────────────────────────────────────────
    private boolean isNetworkAvailable() {
        ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps =
                cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && (
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    // ── UI helpers ────────────────────────────────────────────────
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
