import React, { useState } from 'react';
import { ShieldX, ShieldAlert, RefreshCw, LogOut, ArrowRight, Lock, CheckCircle2, ShieldCheck, Crown, KeyRound } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { acceptInvitation, PRIMARY_SUPERADMIN_EMAIL } from '../services/adminRoleService';

export function AccessDeniedPage() {
  const { user, rawUser, isRevoked, pendingInvitation, refreshClaims, logout, isLoading } = useAdminAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);

  const email = user?.email || rawUser?.email || '';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const hasClaim = await refreshClaims();
      if (!hasClaim) {
        if (isRevoked) {
          setMessage({
            text: 'Your administrator privileges have been revoked. A Superadministrator must issue a new invitation.',
            type: 'error',
          });
        } else {
          setMessage({
            text: 'Privileges are not active yet. If you were just granted access, please click "Activate Invitation" below or check with your Superadmin.',
            type: 'info',
          });
        }
      }
    } catch {
      setMessage({
        text: 'Failed to verify privileges. Please check your internet connection and try again.',
        type: 'error',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleActivateInvite = async (tokenToUse?: string) => {
    const targetToken = tokenToUse || manualToken.trim();
    if (!targetToken) {
      setMessage({ text: 'Please enter a valid invitation token or link.', type: 'error' });
      return;
    }

    // Extract token if user pasted full URL
    let cleanToken = targetToken;
    try {
      if (targetToken.includes('token=')) {
        const urlObj = new URL(targetToken.startsWith('http') ? targetToken : `https://${targetToken}`);
        cleanToken = urlObj.searchParams.get('token') || targetToken;
      }
    } catch {
      // Use as-is
    }

    setIsActivating(true);
    setMessage(null);
    try {
      await acceptInvitation(cleanToken);
      await refreshClaims();
      setMessage({
        text: 'Invitation accepted successfully! Redirecting to management dashboard...',
        type: 'success',
      });
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (err: any) {
      setMessage({
        text: err?.message || 'Failed to activate invitation. Token may be invalid or expired.',
        type: 'error',
      });
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
      <div className="max-w-md w-full bg-slate-950 rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Revocation or Access Restricted Icon */}
        <div
          className={`relative mx-auto w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg border ${
            isRevoked
              ? 'bg-rose-950/60 border-rose-800/80 text-rose-400'
              : pendingInvitation
              ? pendingInvitation.role === 'superadmin'
                ? 'bg-purple-950/60 border-purple-800/80 text-purple-400'
                : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
              : 'bg-amber-950/60 border-amber-800/80 text-amber-400'
          }`}
        >
          {isRevoked ? (
            <ShieldX size={32} className="stroke-[2.2] animate-pulse" />
          ) : pendingInvitation ? (
            pendingInvitation.role === 'superadmin' ? (
              <Crown size={32} className="stroke-[2.2]" />
            ) : (
              <ShieldCheck size={32} className="stroke-[2.2]" />
            )
          ) : (
            <ShieldAlert size={32} className="stroke-[2.2]" />
          )}

          <div
            className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white border-2 border-slate-950 shadow-xs ${
              isRevoked ? 'bg-rose-600' : pendingInvitation ? 'bg-emerald-600' : 'bg-amber-600'
            }`}
          >
            <Lock size={10} className="stroke-[3]" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="text-center space-y-2">
          <span
            className={`inline-block px-3 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider border ${
              isRevoked
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : pendingInvitation
                ? pendingInvitation.role === 'superadmin'
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {isRevoked
              ? 'Access Revoked'
              : pendingInvitation
              ? pendingInvitation.role === 'superadmin'
                ? 'Superadmin Invitation Pending'
                : 'Admin Invitation Pending'
              : 'Unauthorized Account'}
          </span>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight font-display">
            {isRevoked
              ? 'Administrator Access Revoked'
              : pendingInvitation
              ? pendingInvitation.role === 'superadmin'
                ? 'Activate Superadministrator Access'
                : 'Activate Administrator Access'
              : 'Administrator Access Required'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {isRevoked
              ? 'Your administrator privileges for the EMS Management Portal have been removed by a Superadministrator.'
              : pendingInvitation
              ? `An invitation to join as a ${
                  pendingInvitation.role === 'superadmin' ? 'Superadministrator' : 'Dispensary Administrator'
                } was issued for this account. Activate it below to proceed.`
              : 'This Google account is authenticated, but does not currently have active administrator privileges on this system.'}
          </p>
        </div>

        {/* Pending Invitation Activation Card (If found) */}
        {pendingInvitation && !isRevoked && (
          <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-emerald-950/30 rounded-2xl p-4 border border-emerald-500/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              {pendingInvitation.role === 'superadmin' ? (
                <Crown size={15} className="text-purple-400" />
              ) : (
                <ShieldCheck size={15} className="text-emerald-400" />
              )}
              <span>
                {pendingInvitation.role === 'superadmin' ? 'Superadmin Authority' : 'Dispensary Administrator'} Access Ready
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Issued by <strong className="text-slate-100">{pendingInvitation.invitedBy || 'Primary Site Owner'}</strong>.
              Click the button below to complete activation and enter the management portal immediately.
            </p>
            <button
              onClick={() => handleActivateInvite(pendingInvitation.token)}
              disabled={isActivating || isLoading}
              className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isActivating ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} className="text-emerald-200" />
              )}
              <span>{isActivating ? 'Activating Credentials...' : 'Activate Privileges & Enter Portal'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Account Details Box */}
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800/80 space-y-2.5 text-xs font-mono">
          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Account:</span>
            <span className="font-medium text-slate-200 truncate max-w-[220px]" title={email}>
              {email || 'Authenticated User'}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Status:</span>
            {isRevoked ? (
              <span className="font-bold text-rose-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
                Privileges Revoked
              </span>
            ) : pendingInvitation ? (
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Invitation Pending Activation
              </span>
            ) : (
              <span className="font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Pending Role Assignment
              </span>
            )}
          </div>

          <div className="flex justify-between items-center text-slate-400">
            <span className="font-semibold text-slate-500">Authority:</span>
            <span className="text-slate-300 font-sans text-[11px]">
              {isRevoked ? 'Primary Owner Only' : 'Superadmin Delegation'}
            </span>
          </div>
        </div>

        {/* Notice Info */}
        <p className="text-[11px] text-center text-slate-500 leading-relaxed">
          {isRevoked
            ? 'You can no longer view orders, manage inventory, or access administrator configuration. To regain access, a Superadministrator must issue a new invitation.'
            : 'If you were issued an invitation, click "Check Privileges Again" or paste your invitation link below to enter.'}
        </p>

        {/* Optional Manual Token Activation Drawer */}
        {!isRevoked && (
          <div className="pt-1">
            {!showTokenInput ? (
              <button
                type="button"
                onClick={() => setShowTokenInput(true)}
                className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Have an invitation token or invite URL? Enter it here
              </button>
            ) : (
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                  <KeyRound size={12} />
                  <span>Paste invitation token or link:</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="2160d8be... or full URL"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleActivateInvite()}
                    disabled={isActivating || !manualToken.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
                  >
                    Activate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div
            className={`text-xs text-center font-medium p-3 rounded-xl border animate-in fade-in duration-150 ${
              message.type === 'error'
                ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
                : message.type === 'success'
                ? 'text-emerald-300 bg-emerald-950/40 border-emerald-800/60'
                : 'text-amber-300 bg-amber-950/40 border-amber-800/60'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
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
