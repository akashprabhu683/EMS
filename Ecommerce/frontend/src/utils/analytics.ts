import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';
import app from '../firebase';

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;
let isAnalyticsInitialized = false;

/**
 * Checks if user has accepted cookies/analytics consent.
 */
export function hasAnalyticsConsent(): boolean {
  try {
    const consent = localStorage.getItem('ems_cookie_consent_v1');
    return consent === 'all';
  } catch {
    return false;
  }
}

/**
 * Initializes Firebase Analytics only if measurementId exists and user consented.
 */
export async function initAnalytics(): Promise<void> {
  if (isAnalyticsInitialized) return;

  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
  if (!measurementId) return;

  if (!hasAnalyticsConsent()) return;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(app);
      isAnalyticsInitialized = true;
    }
  } catch (err) {
    // Graceful no-op for privacy blockers or unsupported environments
    console.debug('Firebase Analytics initialization skipped:', err);
  }
}

/**
 * Safe logging helper that protects PII.
 */
function safeLogEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (!analyticsInstance && hasAnalyticsConsent()) {
    initAnalytics().then(() => {
      if (analyticsInstance) {
        logEvent(analyticsInstance, eventName, params);
      }
    });
    return;
  }

  if (analyticsInstance) {
    try {
      logEvent(analyticsInstance, eventName, params);
    } catch {
      // Quiet fail to avoid interrupting user flows
    }
  }
}

export function trackPageView(pageTitle: string, path: string): void {
  safeLogEvent('page_view', {
    page_title: pageTitle,
    page_location: window.location.href,
    page_path: path,
  });
}

export function trackViewItem(product: { id: string; name: string; category?: string; price: number }): void {
  safeLogEvent('view_item', {
    item_id: product.id,
    item_name: product.name,
    item_category: product.category || 'Herbal Formulations',
    price: product.price,
    currency: 'INR',
  });
}

export function trackAddToCart(product: { id: string; name: string; price: number; quantity: number }): void {
  safeLogEvent('add_to_cart', {
    item_id: product.id,
    item_name: product.name,
    price: product.price,
    quantity: product.quantity,
    currency: 'INR',
  });
}

export function trackBeginCheckout(itemsCount: number, total: number): void {
  safeLogEvent('begin_checkout', {
    value: total,
    currency: 'INR',
    items_count: itemsCount,
  });
}

export function trackOrderPlaced(orderId: string, total: number, itemsCount: number): void {
  // STRICT: Do NOT send customer phone, name, email, or 6-digit pickupCode!
  safeLogEvent('purchase_click_and_collect', {
    transaction_id: orderId,
    value: total,
    currency: 'INR',
    items_count: itemsCount,
    payment_type: 'counter_in_person',
  });
}
