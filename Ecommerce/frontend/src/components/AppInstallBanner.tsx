import { useState, useEffect } from 'react';
import { Smartphone, X, Bell, Download, ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'ems_app_banner_dismissed_v1';

export function AppInstallBanner() {
  const [dismissed, setDismissed] = useState(true); // default true until checked
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    try {
      if ((window as any).isEMSApp || (window as any).EMS_NATIVE_APP) {
        setDismissed(true);
        return;
      }
      const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true';
      setDismissed(isDismissed);
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      setIsAndroid(/android/i.test(ua));
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const isNativeApp = typeof window !== 'undefined' && Boolean((window as any).isEMSApp || (window as any).EMS_NATIVE_APP);
  if (dismissed || isNativeApp) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-emerald-700/60 relative overflow-hidden mb-6">
      {/* Subtle background botanical accent */}
      <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-emerald-300 shrink-0 border border-white/10 mt-0.5">
            <Smartphone size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                <Bell size={12} />
                Mobile App &amp; Real-Time Alerts
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30 font-medium">
                Android
              </span>
            </div>
            <p className="font-display font-bold text-sm text-white">
              Stay updated on your herbal remedies
            </p>
            <p className="text-xs text-emerald-100/90 leading-relaxed max-w-xl">
              Install the EMS mobile app for real-time order tracking and in-app status updates when your remedies are prepared and ready for dispensary collection.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="https://github.com/akashprabhu683/EMS/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-emerald-950 text-xs font-bold hover:bg-emerald-50 transition-colors shadow-2xs"
              >
                <Download size={13} className="text-emerald-700" />
                <span>{isAndroid ? 'Download Android App' : 'Get Android App'}</span>
              </a>
              <span className="text-[11px] text-emerald-200/80 flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-400" />
                Verified dispensary application
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-emerald-200/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          aria-label="Dismiss app banner"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
