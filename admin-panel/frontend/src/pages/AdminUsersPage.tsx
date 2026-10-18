import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Mail,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
  ShieldAlert,
  Info,
  Copy,
  Send,
} from 'lucide-react';
import {
  getAdminsAndInvitations,
  grantAdmin,
  revokeAdmin,
  resendInvitation,
  type AdminUser,
  type AdminInvitation,
} from '../services/adminRoleService';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AdminUsersPage() {
  const { user: currentUser } = useAdminAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  // Revoke confirmation modal state
  const [revokeTarget, setRevokeTarget] = useState<{ uid?: string; email: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminsAndInvitations();
      setAdmins(data.admins);
      setInvitations(data.invitations);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await grantAdmin(emailInput.trim());
      setSuccessMsg(res.message);
      setEmailInput('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to grant admin privileges.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await revokeAdmin(revokeTarget.uid, revokeTarget.email);
      setSuccessMsg(res.message);
      setRevokeTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke admin privileges.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async (email: string) => {
    setResendingEmail(email);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await resendInvitation(email);
      setSuccessMsg(res.message || `Invitation email resent to ${email}!`);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to resend invitation email.');
    } finally {
      setResendingEmail(null);
    }
  };

  const handleCopyLink = async (inv: AdminInvitation) => {
    const url =
      inv.acceptUrl ||
      `${window.location.origin}/accept-invite?token=${inv.token || ''}&email=${encodeURIComponent(inv.email)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedEmail(inv.email);
      setTimeout(() => setCopiedEmail(null), 3000);
    } catch {
      setError('Could not access clipboard to copy invitation link.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display flex items-center gap-2.5">
            <ShieldCheck className="text-emerald-700" size={28} />
            <span>Administrator Roles</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Manage administrative access and grant team member privileges
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="p-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors"
          >
            <UserPlus size={16} />
            <span>Grant Admin Access</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-800 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Admins</span>
            <Users size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">{admins.length}</div>
          <p className="text-xs text-slate-500 mt-1">Full access to inventory, orders & settings</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Invitations</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">{invitations.length}</div>
          <p className="text-xs text-slate-500 mt-1">Activates on their first Google Sign-In</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Session</span>
            <ShieldCheck size={18} className="text-teal-600" />
          </div>
          <div className="text-sm font-bold text-slate-800 truncate">{currentUser?.email || 'Authenticated'}</div>
          <span className="inline-block px-2 py-0.5 mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
            Current Superadmin
          </span>
        </div>
      </div>

      {/* Active Administrators Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 font-display">Active Administrators</h2>
          <span className="text-xs text-slate-500">{admins.length} accounts</span>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 size={28} className="animate-spin text-emerald-700 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-500">Loading administrators...</p>
          </div>
        ) : admins.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No administrator documents found. Run initial claim sync or invite an admin above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs">
                  <th className="py-3 px-6">Administrator</th>
                  <th className="py-3 px-6">Role</th>
                  <th className="py-3 px-6">Granted By</th>
                  <th className="py-3 px-6">Granted At</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => {
                  const isCurrent = adm.email.toLowerCase() === currentUser?.email?.toLowerCase();
                  return (
                    <tr key={adm.uid} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0">
                            {adm.displayName?.charAt(0).toUpperCase() || adm.email?.charAt(0).toUpperCase() || 'A'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              <span>{adm.displayName}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">{adm.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <ShieldCheck size={12} />
                          Full Admin
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-600 text-xs">{adm.grantedBy || 'System Setup'}</td>
                      <td className="py-4 px-6 text-slate-600 text-xs">
                        {adm.grantedAt ? new Date(adm.grantedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {isCurrent ? (
                          <span className="text-xs text-slate-400 italic">Current Session</span>
                        ) : (
                          <button
                            onClick={() => setRevokeTarget({ uid: adm.uid, email: adm.email })}
                            className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-rose-200 transition-colors inline-flex items-center gap-1.5"
                          >
                            <Trash2 size={13} />
                            <span>Revoke</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations Table */}
      {invitations.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 font-display flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              <span>Pending Admin Invitations</span>
            </h2>
            <span className="text-xs text-slate-500">{invitations.length} pending</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs">
                  <th className="py-3 px-6">Email</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Invited By</th>
                  <th className="py-3 px-6">Invited At</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-semibold text-slate-900 font-mono">{inv.email}</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock size={12} />
                        Pending First Google Sign-In
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs">{inv.invitedBy}</td>
                    <td className="py-4 px-6 text-slate-600 text-xs">
                      {inv.invitedAt ? new Date(inv.invitedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopyLink(inv)}
                          title="Copy direct invitation link"
                          className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold border border-slate-200 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Copy size={13} className="text-slate-500" />
                          <span>{copiedEmail === inv.email ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                        <button
                          onClick={() => handleResendInvite(inv.email)}
                          disabled={resendingEmail === inv.email}
                          title="Resend invitation email via Resend"
                          className="px-2.5 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {resendingEmail === inv.email ? (
                            <Loader2 size={13} className="animate-spin text-emerald-700" />
                          ) : (
                            <Send size={13} className="text-emerald-700" />
                          )}
                          <span>Resend Email</span>
                        </button>
                        <button
                          onClick={() => setRevokeTarget({ email: inv.email })}
                          className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-slate-200 hover:border-rose-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grant Admin Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-800">
                <ShieldCheck size={22} />
                <h3 className="font-bold text-slate-900 text-base font-display">Grant Admin Privileges</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleGrant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Google Account Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-slate-400" size={16} />
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="user@gmail.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-emerald-900 text-xs flex gap-2">
                <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <p>
                  If this user has already signed in, their admin claim is assigned immediately. If not, a pending
                  invitation is created and their admin status will auto-activate upon their first sign-in!
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !emailInput.trim()}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>Grant Role</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-700 mb-3">
              <ShieldAlert size={22} />
              <h3 className="font-bold text-slate-900 text-base font-display">Confirm Role Revocation</h3>
            </div>
            <p className="text-xs text-slate-600 mb-5">
              Are you sure you want to revoke admin access for{' '}
              <strong className="text-slate-900 font-mono">{revokeTarget.email}</strong>? They will no longer be able
              to access the EMS Admin Panel.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors"
              >
                Keep Access
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={actionLoading}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                <span>Revoke Access</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
