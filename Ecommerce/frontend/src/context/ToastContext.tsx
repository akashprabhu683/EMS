import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', durationMs: number = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, durationMs);
  }, [removeToast]);

  const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);
  const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);
  const error = useCallback((message: string) => showToast(message, 'error'), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, info, warning, error }}>
      {children}
      {/* Toast Notification Container */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
        aria-live="polite"
        role="region"
      >
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isInfo = toast.type === 'info';
          const isWarning = toast.type === 'warning';
          const isError = toast.type === 'error';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl shadow-xl border backdrop-blur-md animate-fade-in transition-all ${
                isSuccess
                  ? 'bg-white/98 border-emerald-300 text-slate-800'
                  : isWarning
                  ? 'bg-white/98 border-amber-300 text-slate-800'
                  : isError
                  ? 'bg-white/98 border-rose-300 text-slate-800'
                  : 'bg-white/98 border-blue-300 text-slate-800'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 size={18} className="text-emerald-600" />}
                {isInfo && <Info size={18} className="text-blue-600" />}
                {isWarning && <AlertTriangle size={18} className="text-amber-500" />}
                {isError && <XCircle size={18} className="text-rose-600" />}
              </div>
              <div className="flex-1 text-xs sm:text-sm font-medium leading-snug">
                {toast.message}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                aria-label="Dismiss toast"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
