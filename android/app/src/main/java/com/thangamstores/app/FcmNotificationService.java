package com.thangamstores.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Firebase Cloud Messaging Service for EMS Storefront & Admin applications.
 * Handles background push notifications, token lifecycle, and deep-link routing.
 *
 * Security & Privacy:
 * - Never includes sensitive payment details, card secrets, or collection PINs in push bodies.
 * - Handles notification permissions gracefully on Android 13+ (Tiramisu).
 */
public class FcmNotificationService extends FirebaseMessagingService {

    private static final String TAG = "FcmNotificationService";

    public static final String CHANNEL_ORDER_UPDATES = "order_updates";
    public static final String CHANNEL_DISPENSARY_ALERTS = "dispensary_alerts";

    private static final String PREFS_NAME = "ems_preferences";
    private static final String KEY_FCM_TOKEN = "fcm_token";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Persist token locally for subsequent registration with authenticated backend user
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_FCM_TOKEN, token).apply();

        // Safe logging without exposing raw full token
        String safePrefix = token.length() > 8 ? token.substring(0, 8) + "..." : "[redacted]";
        Log.i(TAG, "New FCM token registered: " + safePrefix);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notification = remoteMessage.getNotification();

        String title = null;
        String body = null;

        if (notification != null) {
            title = notification.getTitle();
            body = notification.getBody();
        }

        if (title == null && data.containsKey("title")) {
            title = data.get("title");
        }
        if (body == null && data.containsKey("body")) {
            body = data.get("body");
        }

        if (title == null) {
            title = getString(R.string.app_name);
        }
        if (body == null) {
            body = "Order update from EMS Dispensary";
        }

        String orderId = data.get("orderId");
        String type = data.get("type");
        String targetUrl = data.get("targetUrl");

        displayNotification(title, body, orderId, type, targetUrl);
    }

    private void displayNotification(String title, String body, String orderId, String type, String targetUrl) {
        createNotificationChannels();

        boolean isAdminAlert = "new_order".equals(type) || "stock_alert".equals(type) || BuildConfig.IS_ADMIN;
        String channelId = isAdminAlert ? CHANNEL_DISPENSARY_ALERTS : CHANNEL_ORDER_UPDATES;

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        if (targetUrl != null && !targetUrl.trim().isEmpty()) {
            intent.putExtra("targetUrl", targetUrl.trim());
        }
        if (orderId != null && !orderId.trim().isEmpty()) {
            intent.putExtra("orderId", orderId.trim());
            // Deep link scheme
            String scheme = BuildConfig.IS_ADMIN ? "ems-admin" : "thangamstores";
            intent.setData(Uri.parse(scheme + "://orders/" + orderId.trim()));
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        int requestCode = orderId != null ? orderId.hashCode() : (int) System.currentTimeMillis();
        PendingIntent pendingIntent = PendingIntent.getActivity(this, requestCode, intent, pendingFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        if (isAdminAlert) {
            builder.setColor(Color.parseColor("#047857")); // Emerald primary
        } else {
            builder.setColor(Color.parseColor("#059669"));
        }

        NotificationManagerCompat notificationManager = NotificationManagerCompat.from(this);

        // Verify runtime notification permission on Android 13+ (API 33)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.w(TAG, "Cannot display FCM notification: POST_NOTIFICATIONS permission not granted");
                return;
            }
        }

        try {
            int notificationId = orderId != null ? Math.abs(orderId.hashCode()) : (int) (System.currentTimeMillis() % 100000);
            notificationManager.notify(notificationId, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "SecurityException while displaying notification", e);
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 1. Order Updates Channel
            NotificationChannel orderChannel = new NotificationChannel(
                    CHANNEL_ORDER_UPDATES,
                    "Order Updates",
                    NotificationManager.IMPORTANCE_HIGH
            );
            orderChannel.setDescription("Notifications for order status changes and Click & Collect pickup readiness.");
            orderChannel.enableLights(true);
            orderChannel.setLightColor(Color.GREEN);
            orderChannel.enableVibration(true);

            // 2. Dispensary Alerts Channel (for Admins / Staff)
            NotificationChannel alertChannel = new NotificationChannel(
                    CHANNEL_DISPENSARY_ALERTS,
                    "Dispensary Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("Operational alerts for new Click & Collect orders and inventory status.");
            alertChannel.enableLights(true);
            alertChannel.setLightColor(Color.CYAN);
            alertChannel.enableVibration(true);

            manager.createNotificationChannel(orderChannel);
            manager.createNotificationChannel(alertChannel);
        }
    }
}
