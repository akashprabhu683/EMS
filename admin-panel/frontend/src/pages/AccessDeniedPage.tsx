import React, { useState } from 'react';
import { ShieldX, RefreshCw, LogOut, ArrowRight, Lock } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AccessDeniedPage() {
  const { user, rawUser, isRevoked, refreshClaims, logout, isLoading } = useAdminAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const email = user?.email || rawUser?.email || '';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const hasClaim = await refreshClaims();
      if (!hasClaim) {
        setMessage('Your administrator privileges are not active. If you were recently revoked, you will need a new invitation from the site owner.');
      }
    } catch {
      setMessage('Failed to verify privileges. Please check your internet connection and try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
      <div className="max-w-md w-full bg-slate-950 rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Revocation Icon */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center shadow-lg">
          <ShieldX size={32} className="stroke-[2.2] animate-pulse" />
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 rounded-full flex items-center justify-center text-white border-2 border-slate-950 shadow-xs">
            <Lock size={10} className="stroke-[3]" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="text-center space-y-2">
          <span className="inline-block px-3 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded-full uppercase tracking-wider">
            {isRevoked ? 'Access Revoked' : 'Unauthorized Account'}
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight font-display">
            {isRevoked ? 'Administrator Access Revoked' : 'Access Restricted'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {isRevoked
              ? 'Your administrator privileges for the EMS Management Portal have been removed by the primary site owner.'
              : 'This Google account is not recognized as an active administrator on this system.'}
          </p>
        </div>

        {/* Account Details Box */}
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800/80 space-y-2.5 text-xs font-mono">
          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Account:</span>
            <span className="font-medium text-slate-200 truncate max-w-[220px]">{email || 'Authenticated User'}</span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Status:</span>
            <span className="font-bold text-rose-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
              Privileges Revoked
            </span>
          </div>
          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Authority:</span>
            <span className="text-slate-300 font-sans text-[11px]">Primary Owner Only</span>
          </div>
        </div>

        {/* Notice Info */}
        <p className="text-[11px] text-center text-slate-500 leading-relaxed">
          You can no longer view orders, manage inventory, or access administrator configuration. To regain access, the primary site owner must issue a new invitation.
        </p>

        {message && (
          <div className="text-xs text-center text-rose-300 font-medium bg-rose-950/40 p-3 rounded-xl border border-rose-800/60 animate-in fade-in duration-150">
            {message}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-2 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Check Privileges Again</span>
          </button>

          <button
            onClick={logout}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out from Portal</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
