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
  const isInfo    = toast.type === 'info';
  const isWarning = toast.type === 'warning';
  const isError   = toast.type === 'error';

  const borderColor = isSuccess ? 'border-emerald-300'
    : isWarning ? 'border-amber-300'
    : isError   ? 'border-rose-300'
    : 'border-slate-300';

  const iconEl = isSuccess ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-0.5" />
    : isWarning ? <AlertTriangle size={17} className="text-amber-500 shrink-0 mt-0.5" />
    : isError   ? <XCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
    : <Info size={17} className="text-blue-500 shrink-0 mt-0.5" />;

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl
        shadow-xl border bg-white backdrop-blur-md w-full max-w-full overflow-hidden
        transition-all duration-300 ease-out
        ${borderColor}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
      `}
      role="alert"
    >
      {iconEl}
      <p className="flex-1 min-w-0 text-xs sm:text-sm font-medium text-slate-800 leading-snug break-words [overflow-wrap:anywhere]">
        {toast.message}
      </p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
        aria-label="Dismiss"
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

  const showToast = useCallback((message: string, type: ToastType = 'info', durationMs = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), durationMs);
  }, [removeToast]);

  const success = useCallback((m: string) => showToast(m, 'success'), [showToast]);
  const info    = useCallback((m: string) => showToast(m, 'info'),    [showToast]);
  const warning = useCallback((m: string) => showToast(m, 'warning'), [showToast]);
  const error   = useCallback((m: string) => showToast(m, 'error', 6000), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, info, warning, error }}>
      {children}
      <div
        className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-md z-[9999] flex flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
        role="region"
        aria-label="Notifications"
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
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
