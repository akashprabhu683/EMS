package com.thangamstores.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
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
import androidx.browser.customtabs.CustomTabsIntent;
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
        settings.setDomStorageEnabled(true);       // Firebase Auth uses localStorage
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Modern user agent — helps Google OAuth work correctly
        String ua = settings.getUserAgentString().replace("; wv", "");
        settings.setUserAgentString(ua);

        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        // ── WebViewClient — handle navigation ─────────────────────
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                String scheme = uri.getScheme();

                // Allow navigation within the storefront domain
                if (host != null && host.equals(STOREFRONT_HOST)) {
                    return false; // let WebView handle it
                }

                // Google OAuth / Firebase Auth sign-in flows
                if (host != null && (
                        host.equals("accounts.google.com") ||
                        host.endsWith(".google.com") ||
                        host.equals("firebaseapp.com") ||
                        host.endsWith(".firebaseapp.com"))) {
                    // Open in Chrome Custom Tabs for proper OAuth support
                    openInCustomTabs(uri);
                    return true;
                }

                // Open all other external links in Chrome, not in app
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    if (intent.resolveActivity(getPackageManager()) != null) {
                        startActivity(intent);
                    }
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

        // ── WebChromeClient — title, progress & file upload support ──
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                return false; // suppress console noise in production
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

        // ── Swipe-to-refresh ─────────────────────────────────────
        swipeRefresh.setColorSchemeResources(R.color.emerald_700);
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

    // ── Open a URL in Chrome Custom Tabs (for Google OAuth) ───────
    private void openInCustomTabs(Uri uri) {
        try {
            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build();
            customTabsIntent.launchUrl(this, uri);
        } catch (Exception e) {
            // Fallback to default browser
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            if (intent.resolveActivity(getPackageManager()) != null) {
                startActivity(intent);
            }
        }
    }

    // ── Back navigation inside WebView ────────────────────────────
    @Override
    public void onBackPressed() {
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
