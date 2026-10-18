import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AccessDeniedPage() {
  const { user, rawUser, refreshClaims, logout, isLoading } = useAdminAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const uid = user?.uid || rawUser?.uid || '';
  const email = user?.email || rawUser?.email || '';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const hasClaim = await refreshClaims();
      if (!hasClaim) {
        setMessage('The "admin" custom claim has not been assigned yet. Please run the server-side CLI command.');
      }
    } catch {
      setMessage('Failed to refresh claims. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
          <ShieldAlert size={28} />
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Administrator Access Denied
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            Your account is authenticated, but lacks the trusted <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono text-xs font-semibold">admin: true</code> custom claim required to manage the EMS catalog.
          </p>
        </div>

        {/* User identification info */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-600">
            <span className="font-semibold">Signed-in User:</span>
            <span className="font-medium text-slate-900">{email || 'Unknown'}</span>
          </div>
          <div className="flex justify-between items-center text-slate-600">
            <span className="font-semibold">UID:</span>
            <span className="font-mono text-slate-700 truncate max-w-[200px]">{uid || 'N/A'}</span>
          </div>
        </div>

        {/* Help Notice */}
        <p className="text-xs text-center text-slate-400 leading-relaxed">
          If you believe you should have administrative access, please contact an existing EMS administrator to send an invitation to your email.
        </p>

        {message && (
          <p className="text-xs text-center text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200">
            {message}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center gap-2 shadow-2xs transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Check Privileges</span>
          </button>
          <button
            onClick={logout}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
