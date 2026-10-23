import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Cookie, X } from 'lucide-react';
import { initAnalytics } from '../utils/analytics';

const STORAGE_KEY = 'ems_cookie_consent_v1';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        // Small delay so it appears smoothly after page load
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      } else if (consent === 'all') {
        initAnalytics();
      }
    } catch {
      // LocalStorage access restricted in private mode
    }
  }, []);

  const handleAcceptAll = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'all');
      initAnalytics();
    } catch {
      // Fallback
    }
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'essential');
    } catch {
      // Fallback
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Privacy and Cookie Consent"
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-6 md:right-auto md:max-w-md z-50 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xl animate-fade-in text-slate-900"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
          <Cookie size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
              <span>Privacy &amp; Cookie Notice</span>
              <ShieldCheck size={14} className="text-emerald-600" />
            </h3>
            <button
              onClick={handleEssentialOnly}
              className="text-slate-400 hover:text-slate-600 p-1 -mr-1 rounded-lg"
              aria-label="Close cookie notice"
            >
              <X size={15} />
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            We use essential local storage to keep your session secure and manage your Click &amp; Collect bag. Optional privacy-respecting analytics help us improve our catalog. Zero advertising trackers.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleAcceptAll}
              id="cookie-accept-all-btn"
              className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              Accept All
            </button>
            <button
              onClick={handleEssentialOnly}
              id="cookie-essential-btn"
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Essential Only
            </button>
            <Link
              to="/privacy"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2 ml-auto"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
