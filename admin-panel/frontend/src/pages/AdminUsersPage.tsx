import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Mail,
  Trash2,
  Clock,
  Loader2,
  RefreshCw,
  Users,
  ShieldAlert,
  Info,
  Copy,
  Send,
  CheckCircle2,
  Check,
  Crown,
} from 'lucide-react';
import {
  getAdminsAndInvitations,
  grantAdmin,
  revokeAdmin,
  resendInvitation,
  PRIMARY_SUPERADMIN_EMAIL,
  type AdminUser,
  type AdminInvitation,
} from '../services/adminRoleService';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../context/ToastContext';

export function AdminUsersPage() {
  const { user: currentUser } = useAdminAuth();
  const toast = useToast();

  const isOwner = currentUser?.email?.toLowerCase().trim() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissedAcceptedEmails, setDismissedAcceptedEmails] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('dismissed_accepted_admin_cards');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  // Revoke confirmation modal state
  const [revokeTarget, setRevokeTarget] = useState<{ uid?: string; email: string } | null>(null);

  // Dismiss card with pop and slide-out right animation:
  // Immediately triggers pop animation, stays idle for 0.3s, slides right out of screen, then unmounts
  const handleDismissAcceptedCard = (email: string) => {
    const clean = email.toLowerCase();
    setDismissingId(clean);

    setTimeout(() => {
      setDismissedAcceptedEmails((prev) => {
        const next = new Set(prev);
        next.add(clean);
        try {
          localStorage.setItem('dismissed_accepted_admin_cards', JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        return next;
      });
      setDismissingId(null);
    }, 850);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminsAndInvitations();
      setAdmins(data.admins);
      // Filter out any invitation whose email is already an active administrator
      const activeAdminEmails = new Set(data.admins.map((a) => a.email.toLowerCase()));
      const pendingInvites = data.invitations.filter(
        (inv) => inv.status === 'pending' && !activeAdminEmails.has(inv.email.toLowerCase())
      );
      setInvitations(pendingInvites);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load administrator list. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setActionLoading(true);
    try {
      const res = await grantAdmin(emailInput.trim());
      toast.success(res.message || `Admin invitation sent to ${emailInput.trim()}!`);
      setEmailInput('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant admin privileges. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;

    setActionLoading(true);
    try {
      const res = await revokeAdmin(revokeTarget.uid, revokeTarget.email);
      toast.success(res.message || `Admin access revoked for ${revokeTarget.email}.`);
      setRevokeTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke admin privileges. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async (email: string) => {
    setResendingEmail(email);
    try {
      const res = await resendInvitation(email);
      toast.success(res.message || `Invitation email resent to ${email}!`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || `Failed to resend invitation to ${email}. Please try again.`);
    } finally {
      setResendingEmail(null);
    }
  };

  const handleCopyLink = async (inv: AdminInvitation) => {
    let url = inv.acceptUrl;
    if (!url && inv.token) {
      url = `${window.location.origin}/accept-invite?token=${inv.token}&email=${encodeURIComponent(inv.email)}`;
    }

    if (!url) {
      toast.info(`Generating a fresh invitation link for ${inv.email}...`);
      try {
        const refreshed = await resendInvitation(inv.email);
        url = refreshed.acceptUrl;
        await loadData();
      } catch {
        toast.error('Could not generate link. Please use "Resend Invitation".');
        return;
      }
    }

    if (!url) {
      toast.error('No invitation URL available. Please resend the invitation.');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedEmail(inv.email);
      toast.info(`Invitation link copied to clipboard for ${inv.email}`);
      setTimeout(() => setCopiedEmail(null), 3000);
    } catch {
      toast.error('Could not access clipboard. Please copy the link manually.');
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
          {isOwner && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors"
            >
              <UserPlus size={16} />
              <span>Grant Admin Access</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Admins</span>
            <Users size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">{admins.length}</div>
          <p className="text-xs text-slate-500 mt-1">Full access to inventory, orders &amp; settings</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Invitations</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-display">{invitations.length}</div>
          <p className="text-xs text-slate-500 mt-1">
            {invitations.length === 0 ? 'All sent invitations have been accepted' : 'Waiting for the invitee to accept via email'}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Session</span>
            <ShieldCheck size={18} className="text-teal-600" />
          </div>
          <div className="text-sm font-bold text-slate-800 truncate">{currentUser?.email || 'Authenticated'}</div>
          {isOwner ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-amber-100 text-amber-900 text-[10px] font-bold rounded-md border border-amber-200">
              <Crown size={11} className="text-amber-700" />
              Primary Site Owner
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
              Administrator
            </span>
          )}
        </div>
      </div>

      {/* Accepted Invitations Notifications — Smooth Pop & Slide-out Right on Click */}
      {admins
        .filter((adm) => {
          const cleanEmail = adm.email.toLowerCase();
          // Exclude initial_setup and already dismissed cards
          return (
            adm.grantedBy !== 'initial_setup' &&
            !dismissedAcceptedEmails.has(cleanEmail)
          );
        })
        .map((adm) => {
          const cleanEmail = adm.email.toLowerCase();
          const isDismissing = dismissingId === cleanEmail;
          return (
            <div
              key={`accepted-${adm.uid}`}
              className={`relative overflow-hidden bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/40 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 shadow-xs transition-all ${
                isDismissing ? 'animate-pop-slide-right' : 'animate-in fade-in'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <CheckCircle2 size={22} className="stroke-[2.5]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 font-display">
                        Invitation Accepted!
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                        <Check size={10} className="stroke-[3]" />
                        Active Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      <span className="font-semibold text-slate-800 font-mono">{adm.email}</span> ({adm.displayName}) has accepted administrator privileges.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDismissAcceptedCard(adm.email)}
                    disabled={isDismissing}
                    className="group flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-300 hover:border-emerald-600 text-xs font-bold rounded-xl shadow-2xs hover:shadow-xs transition-all transform active:scale-95 cursor-pointer"
                    title="Acknowledge and dismiss notification"
                  >
                    <Check size={14} className="stroke-[3] text-emerald-600 group-hover:text-white transition-colors" />
                    <span>✓</span>
                    <span className="hidden sm:inline">Acknowledge</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

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
                  const isPrimaryOwner = adm.email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();

                  return (
                    <tr key={adm.uid} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${
                              isPrimaryOwner
                                ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-300'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {adm.displayName?.charAt(0).toUpperCase() || adm.email?.charAt(0).toUpperCase() || 'A'}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              <span>{adm.displayName}</span>
                              {isPrimaryOwner && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-bold border border-amber-200">
                                  <Crown size={10} className="text-amber-700" />
                                  Owner
                                </span>
                              )}
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
                        {isPrimaryOwner ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                            <Crown size={12} className="text-amber-700" />
                            Primary Owner
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShieldCheck size={12} />
                            Full Admin
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-600 text-xs">{adm.grantedBy || 'System Setup'}</td>
                      <td className="py-4 px-6 text-slate-600 text-xs">
                        {adm.grantedAt ? new Date(adm.grantedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {isPrimaryOwner ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-800 font-semibold px-2 py-1 bg-amber-50 rounded-lg border border-amber-200">
                            <Crown size={12} className="text-amber-600" />
                            Protected Owner
                          </span>
                        ) : isCurrent ? (
                          <span className="text-xs text-slate-400 italic">Current Session</span>
                        ) : isOwner ? (
                          <button
                            onClick={() => setRevokeTarget({ uid: adm.uid, email: adm.email })}
                            className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-rose-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No Permission</span>
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
                        Awaiting Acceptance
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
                          title="Copy direct invitation link to clipboard"
                          className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold border border-slate-200 transition-colors inline-flex items-center gap-1.5"
                        >
                          {copiedEmail === inv.email ? (
                            <CheckCircle2 size={13} className="text-emerald-600" />
                          ) : (
                            <Copy size={13} className="text-slate-500" />
                          )}
                          <span>{copiedEmail === inv.email ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => handleResendInvite(inv.email)}
                              disabled={resendingEmail === inv.email}
                              title="Resend invitation email via Resend"
                              className="px-2.5 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-semibold border border-emerald-200 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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
                              className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        )}
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
                  An invitation email will be sent to this address. The recipient must click the link in the email to accept and activate their admin privileges.
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
                  <span>Send Invitation</span>
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
