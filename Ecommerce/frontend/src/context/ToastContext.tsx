import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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

function ToastItem({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  const isSuccess = toast.type === 'success';
  const isInfo = toast.type === 'info';
  const isWarning = toast.type === 'warning';
  const isError = toast.type === 'error';

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl
        shadow-2xl border bg-white/98 backdrop-blur-md w-full max-w-full overflow-hidden
        transition-all duration-300 ease-out transform
        ${
          isSuccess
            ? 'border-emerald-300 text-slate-800'
            : isWarning
            ? 'border-amber-300 text-slate-800'
            : isError
            ? 'border-rose-300 text-slate-800'
            : 'border-emerald-300 text-slate-800'
        }
        ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'}
      `}
      role="alert"
    >
      <div className="shrink-0 mt-0.5">
        {isSuccess && <CheckCircle2 size={18} className="text-emerald-600" />}
        {isInfo && <Info size={18} className="text-emerald-700" />}
        {isWarning && <AlertTriangle size={18} className="text-amber-500" />}
        {isError && <XCircle size={18} className="text-rose-600" />}
      </div>
      <div className="flex-1 min-w-0 text-xs sm:text-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">
        {toast.message}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
        aria-label="Dismiss toast"
      >
        <X size={14} />
      </button>
    </div>
  );
}

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
        className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2.5 w-full max-w-md px-4 pointer-events-none"
        aria-live="polite"
        role="region"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
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
