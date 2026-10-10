import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut, Copy, Check } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AccessDeniedPage() {
  const { user, rawUser, refreshClaims, logout, isLoading } = useAdminAuth();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const uid = user?.uid || rawUser?.uid || '';
  const email = user?.email || rawUser?.email || '';

  const handleCopy = () => {
    if (email) {
      navigator.clipboard.writeText(`node scripts/set-admin-claim.mjs ${email}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

        {/* Instructions for server administrator */}
        <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-200 space-y-2.5">
          <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">
            How to grant admin access:
          </p>
          <p className="text-xs text-blue-800 leading-relaxed">
            Run the trusted server-side command in your project terminal:
          </p>
          <div className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-blue-200 font-mono text-[11px] text-slate-800">
            <span className="truncate pr-2">node scripts/set-admin-claim.mjs {email}</span>
            <button
              onClick={handleCopy}
              className="text-blue-600 hover:text-blue-800 p-1 flex-shrink-0"
              title="Copy command"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {message && (
          <p className="text-xs text-center text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200">
            {message}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 shadow-2xs transition-colors disabled:opacity-50"
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
