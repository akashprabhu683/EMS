import React, { useState } from 'react';
import {
  ShieldCheck,
  User,
  Mail,
  Key,
  Calendar,
  Lock,
  LogOut,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Shield,
  Layers,
  ShoppingBag,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../context/ToastContext';
import { copyToClipboard } from '../utils/clipboard';

export function AdminProfilePage() {
  const { user, rawUser, logout, isAdmin } = useAdminAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [copiedUid, setCopiedUid] = useState(false);

  const handleCopyUid = async () => {
    if (user?.uid) {
      await copyToClipboard(user.uid);
      setCopiedUid(true);
      toast.success('Admin UID copied to clipboard!');
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
            Administrator Profile
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Authenticated administrator credentials, custom role claims, and permissions
          </p>
        </div>

        <button
          onClick={handleSignOut}
          className="self-start sm:self-auto px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors"
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Main Profile Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-slate-100">
          <div className="w-20 h-20 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-extrabold text-2xl shadow-md shrink-0 overflow-hidden">
            {rawUser?.photoURL ? (
              <img
                src={rawUser.photoURL}
                alt={user?.displayName || 'Admin'}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              (user?.displayName || user?.email || 'A').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 font-display">
                {user?.displayName || user?.email?.split('@')[0] || 'Administrator'}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                <ShieldCheck size={13} className="text-emerald-600" />
                Verified Admin
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-mono truncate">{user?.email}</p>
          </div>
        </div>

        {/* Security & Credentials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Firebase Auth UID
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-slate-800 truncate select-all">
                {user?.uid || '—'}
              </span>
              <button
                onClick={handleCopyUid}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200 transition-colors shrink-0"
                title="Copy UID"
              >
                {copiedUid ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Role Authority
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-800">
                Dispensary Administrator (Claims: admin=true)
              </span>
            </div>
          </div>
        </div>

        {/* Access Rights Checklist */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Granted Administrative Privileges
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Click &amp; Collect Orders</p>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Accept incoming orders, track preparation stages, and confirm counter payments.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Inventory &amp; Stock Levels</p>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Modify medicine quantities, prices, low-stock threshold triggers, and active status.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Category Taxonomies</p>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Create, reorder, and toggle herbal category listings with custom URL slugs.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-950">Admin Delegation &amp; Invites</p>
                <p className="text-emerald-800 text-[11px] mt-0.5">
                  Invite new colleagues, generate cryptographically signed tokens, and revoke access.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Shortcuts */}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <Link
            to="/admins"
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors"
          >
            <Shield size={14} className="text-emerald-700" />
            <span>Manage Other Admins</span>
          </Link>
          <Link
            to="/orders"
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ShoppingBag size={14} className="text-emerald-700" />
            <span>Real-time Orders</span>
          </Link>
          <Link
            to="/customers"
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors"
          >
            <User size={14} className="text-emerald-700" />
            <span>Customer Directory</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
