import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  CheckCircle2,
  Check,
  Crown,
  ChevronDown,
  Sparkles,
  Shield,
  KeyRound,
} from 'lucide-react';
import {
  getAdminsAndInvitations,
  grantAdmin,
  revokeAdmin,
  PRIMARY_SUPERADMIN_EMAIL,
  type AdminUser,
  type AdminInvitation,
} from '../services/adminRoleService';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../context/ToastContext';
import { copyToClipboard } from '../utils/clipboard';

export function AdminUsersPage() {
  const { user: currentUser } = useAdminAuth();
  const toast = useToast();

  const isOwner = currentUser?.email?.toLowerCase().trim() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();
  const isSuperadmin = isOwner || Boolean(currentUser?.isSuperadmin) || currentUser?.role === 'superadmin';

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

  // Modal & 2-Way Invite state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [grantDropdownOpen, setGrantDropdownOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'superadmin'>('admin');
  const [emailInput, setEmailInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [createdInviteEmail, setCreatedInviteEmail] = useState<string | null>(null);
  const [createdInviteRole, setCreatedInviteRole] = useState<'admin' | 'superadmin'>('admin');
  const [cachedLinks, setCachedLinks] = useState<Record<string, string>>({});

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setGrantDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Revoke confirmation modal state
  const [revokeTarget, setRevokeTarget] = useState<{ uid?: string; email: string; role?: string } | null>(null);

  const openGrantModal = (role: 'admin' | 'superadmin' = 'admin') => {
    setSelectedRole(role);
    setCreatedInviteUrl(null);
    setCreatedInviteEmail(null);
    setEmailInput('');
    setIsModalOpen(true);
    setGrantDropdownOpen(false);
  };

  const handleDismissAcceptedCard = (email: string) => {
    if (!isSuperadmin) {
      toast.error('Only Superadministrators can acknowledge accepted invitations.');
      return;
    }

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

      // Deduplicate administrators by email to ensure 1 seat per email address
      const adminsByEmail = new Map<string, AdminUser>();
      (data.admins || []).forEach((adm) => {
        const key = adm.email.toLowerCase().trim();
        if (!adminsByEmail.has(key)) {
          adminsByEmail.set(key, adm);
        } else {
          const existing = adminsByEmail.get(key)!;
          if (!existing.grantedAt && adm.grantedAt) {
            adminsByEmail.set(key, adm);
          } else if (existing.uid.startsWith('legit_') || existing.uid.startsWith('test_')) {
            adminsByEmail.set(key, adm);
          }
        }
      });
      const uniqueAdmins = Array.from(adminsByEmail.values());
      setAdmins(uniqueAdmins);

      // Filter out any invitation whose email is already an active administrator
      const activeAdminEmails = new Set(uniqueAdmins.map((a) => a.email.toLowerCase()));
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
    const targetEmail = emailInput.trim().toLowerCase();
    if (!targetEmail) return;

    setActionLoading(true);
    try {
      const res = await grantAdmin(targetEmail, selectedRole);
      const url = res.acceptUrl || (res as any).url;

      if (url) {
        setCreatedInviteUrl(url);
        setCreatedInviteEmail(targetEmail);
        setCreatedInviteRole(selectedRole);
        setCachedLinks((prev) => ({ ...prev, [targetEmail]: url }));

        const copied = await copyToClipboard(url);
        if (copied) {
          toast.success(
            `${selectedRole === 'superadmin' ? 'Superadmin' : 'Administrator'} invitation link copied to clipboard for ${targetEmail}!`
          );
        } else {
          toast.info(`Invitation link created for ${targetEmail}. Please copy it below.`);
        }
      } else {
        toast.success(
          `${selectedRole === 'superadmin' ? 'Superadmin' : 'Admin'} privileges generated for ${targetEmail}!`
        );
        setIsModalOpen(false);
      }
      setEmailInput('');
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
      toast.success(res.message || `Access revoked for ${revokeTarget.email}.`);
      setRevokeTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke administrator privileges. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyLink = async (inv: AdminInvitation) => {
    const emailKey = inv.email.toLowerCase().trim();
    let url = inv.acceptUrl || cachedLinks[emailKey];
    if (!url && inv.token) {
      url = `${window.location.origin}/accept-invite?token=${inv.token}&email=${encodeURIComponent(inv.email)}`;
    }

    if (!url) {
      try {
        const res = await grantAdmin(inv.email, inv.role || 'admin');
        if (res.acceptUrl) {
          url = res.acceptUrl;
          setCachedLinks((prev) => ({ ...prev, [emailKey]: url }));
        }
      } catch (err: any) {
        toast.error(err.message || 'Could not retrieve invitation link.');
        return;
      }
    }

    if (!url) {
      toast.error('Could not retrieve invitation link.');
      return;
    }

    const copied = await copyToClipboard(url);
    if (copied) {
      setCopiedEmail(inv.email);
      toast.success(`Invitation link copied to clipboard for ${inv.email}`);
      setTimeout(() => setCopiedEmail(null), 3000);
    } else {
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
            className="p-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title="Refresh list"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* 2-Way Grant Access Action (Superadmins only) */}
          {isSuperadmin && (
            <div className="relative" ref={dropdownRef}>
              <div className="inline-flex rounded-xl shadow-xs">
                <button
                  onClick={() => openGrantModal('admin')}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-l-xl flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus size={16} />
                  <span>Grant Access</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGrantDropdownOpen(!grantDropdownOpen)}
                  className="px-2.5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-r-xl border-l border-emerald-600 transition-colors cursor-pointer"
                  title="Choose access tier"
                >
                  <ChevronDown size={16} className={`transition-transform duration-200 ${grantDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* 2-Way Access Dropdown Menu */}
              {grantDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-30 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Select Access Tier
                  </div>

                  <button
                    onClick={() => openGrantModal('admin')}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-emerald-50 text-slate-800 flex items-start gap-2.5 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                        Invite Administrator
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Dispensary operations, catalog, orders &amp; inventory.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => openGrantModal('superadmin')}
                    className="w-full text-left p-2.5 rounded-xl hover:bg-purple-50 text-slate-800 flex items-start gap-2.5 transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      <Crown size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-purple-900 flex items-center gap-1.5">
                        <span>Invite Superadmin</span>
                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-bold">Full</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Full authority, admin delegation &amp; audit trails.
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
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
            {invitations.length === 0 ? 'All sent invitations have been accepted' : 'Waiting for the invitee to accept via invite link'}
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
              Primary Site Owner (Root)
            </span>
          ) : isSuperadmin ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 bg-purple-100 text-purple-900 text-[10px] font-bold rounded-md border border-purple-200">
              <Crown size={11} className="text-purple-700" />
              Superadministrator
            </span>
          ) : (
            <span className="inline-block px-2 py-0.5 mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
              Administrator
            </span>
          )}
        </div>
      </div>

      {/* Accepted Invitations Notifications — Shown to Superadmins */}
      {isSuperadmin &&
        admins
          .filter((adm) => {
            const cleanEmail = adm.email.toLowerCase();
            return adm.grantedBy !== 'initial_setup' && !dismissedAcceptedEmails.has(cleanEmail);
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
                  <th className="py-3 px-6">Role Authority</th>
                  <th className="py-3 px-6">Granted By</th>
                  <th className="py-3 px-6">Granted At</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((adm) => {
                  const isCurrent = adm.email.toLowerCase() === currentUser?.email?.toLowerCase();
                  const isPrimaryOwner = adm.email.toLowerCase() === PRIMARY_SUPERADMIN_EMAIL.toLowerCase();
                  const isAdminSuper = isPrimaryOwner || adm.role === 'superadmin';

                  return (
                    <tr key={adm.uid} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${
                              isPrimaryOwner
                                ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400'
                                : isAdminSuper
                                ? 'bg-purple-100 text-purple-900 ring-2 ring-purple-300'
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
                              {isAdminSuper && !isPrimaryOwner && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded font-bold border border-purple-200">
                                  <Crown size={10} className="text-purple-700" />
                                  Superadmin
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

                      {/* Role Authority Badge */}
                      <td className="py-4 px-6">
                        {isPrimaryOwner ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                            <Crown size={12} className="text-amber-700" />
                            Primary Owner
                          </span>
                        ) : isAdminSuper ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-900 border border-purple-200">
                            <Crown size={12} className="text-purple-700" />
                            Superadmin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShieldCheck size={12} />
                            Administrator
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-slate-600 text-xs">{adm.grantedBy || 'System Setup'}</td>
                      <td className="py-4 px-6 text-slate-600 text-xs">
                        {adm.grantedAt ? new Date(adm.grantedAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        {isPrimaryOwner ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-800 font-semibold px-2 py-1 bg-amber-50 rounded-lg border border-amber-200">
                            <Crown size={12} className="text-amber-600" />
                            Protected Owner
                          </span>
                        ) : isCurrent ? (
                          <span className="text-xs text-slate-400 italic">Current Session</span>
                        ) : isOwner ? (
                          // Primary owner can revoke any admin or superadmin
                          <button
                            onClick={() => setRevokeTarget({ uid: adm.uid, email: adm.email, role: adm.role })}
                            className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-rose-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Revoke</span>
                          </button>
                        ) : isSuperadmin && !isAdminSuper ? (
                          // Fellow superadmins can revoke regular administrators
                          <button
                            onClick={() => setRevokeTarget({ uid: adm.uid, email: adm.email, role: adm.role })}
                            className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-rose-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Revoke</span>
                          </button>
                        ) : isAdminSuper ? (
                          <span className="text-xs text-slate-400 italic" title="Only the Primary Owner can revoke fellow Superadmins">
                            Superadmin Protected
                          </span>
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
                  <th className="py-3 px-6">Target Role</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Invited By</th>
                  <th className="py-3 px-6">Invited At</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((inv) => {
                  const isInvSuper = inv.role === 'superadmin';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-6 font-semibold text-slate-900 font-mono">{inv.email}</td>
                      <td className="py-4 px-6">
                        {isInvSuper ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-900 border border-purple-200">
                            <Crown size={12} className="text-purple-700" />
                            Superadmin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <ShieldCheck size={12} />
                            Administrator
                          </span>
                        )}
                      </td>
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
                            className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold border border-slate-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedEmail === inv.email ? (
                              <CheckCircle2 size={13} className="text-emerald-600" />
                            ) : (
                              <Copy size={13} className="text-slate-500" />
                            )}
                            <span>{copiedEmail === inv.email ? 'Copied!' : 'Copy Link'}</span>
                          </button>
                          {(isOwner || (isSuperadmin && !isInvSuper)) && (
                            <button
                              onClick={() => setRevokeTarget({ email: inv.email, role: inv.role })}
                              className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grant Admin / Superadmin Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                    selectedRole === 'superadmin' ? 'bg-purple-700' : 'bg-emerald-700'
                  }`}
                >
                  {selectedRole === 'superadmin' ? <Crown size={20} /> : <ShieldCheck size={20} />}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base font-display">
                    {selectedRole === 'superadmin' ? 'Grant Superadmin Authority' : 'Grant Administrator Access'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedRole === 'superadmin' ? 'Elevated administrative & delegation tier' : 'Standard dispensary operational tier'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setCreatedInviteUrl(null);
                  setCreatedInviteEmail(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            {createdInviteUrl ? (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
                    createdInviteRole === 'superadmin'
                      ? 'bg-purple-50 border-purple-200 text-purple-950'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2
                      size={16}
                      className={createdInviteRole === 'superadmin' ? 'text-purple-700' : 'text-emerald-700'}
                    />
                    <span>
                      {createdInviteRole === 'superadmin' ? 'Superadmin' : 'Administrator'} Invitation Link Ready!
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Share this invitation link with <strong className="font-mono text-slate-900">{createdInviteEmail}</strong>.
                    When they sign in, they will receive {createdInviteRole === 'superadmin' ? 'Superadministrator' : 'Administrator'} privileges.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Direct Invitation Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInviteUrl}
                      className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-300 text-xs font-mono text-slate-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (createdInviteUrl) {
                          await copyToClipboard(createdInviteUrl);
                          setCopiedEmail(createdInviteEmail || 'modal');
                          toast.success('Invitation link copied to clipboard!');
                          setTimeout(() => setCopiedEmail(null), 3000);
                        }
                      }}
                      className={`px-3.5 py-2 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                        createdInviteRole === 'superadmin'
                          ? 'bg-purple-700 hover:bg-purple-800'
                          : 'bg-emerald-700 hover:bg-emerald-800'
                      }`}
                    >
                      {copiedEmail === (createdInviteEmail || 'modal') ? (
                        <>
                          <CheckCircle2 size={14} />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setCreatedInviteUrl(null);
                      setCreatedInviteEmail(null);
                    }}
                    className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleGrant} className="space-y-4">
                {/* 2-Way Role Selector Cards */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Select Access Role:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Role 1: Administrator */}
                    <button
                      type="button"
                      onClick={() => setSelectedRole('admin')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        selectedRole === 'admin'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/30 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <ShieldCheck
                          size={18}
                          className={selectedRole === 'admin' ? 'text-emerald-700' : 'text-slate-400'}
                        />
                        <span
                          className={`text-xs font-bold ${
                            selectedRole === 'admin' ? 'text-emerald-950' : 'text-slate-800'
                          }`}
                        >
                          Administrator
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Dispensary operations, catalog, inventory &amp; order fulfillment.
                      </p>
                    </button>

                    {/* Role 2: Superadmin */}
                    <button
                      type="button"
                      onClick={() => setSelectedRole('superadmin')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        selectedRole === 'superadmin'
                          ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-600/30 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Crown
                          size={18}
                          className={selectedRole === 'superadmin' ? 'text-purple-700' : 'text-slate-400'}
                        />
                        <span
                          className={`text-xs font-bold ${
                            selectedRole === 'superadmin' ? 'text-purple-950' : 'text-slate-800'
                          }`}
                        >
                          Superadmin
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Full administrative authority, role delegation &amp; audit trails.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Email Address Input */}
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

                {/* Role Specific Explanation Banner */}
                <div
                  className={`p-3 rounded-xl border text-xs flex gap-2.5 ${
                    selectedRole === 'superadmin'
                      ? 'bg-purple-50 border-purple-200 text-purple-950'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <Info
                    size={16}
                    className={`shrink-0 mt-0.5 ${
                      selectedRole === 'superadmin' ? 'text-purple-700' : 'text-emerald-700'
                    }`}
                  />
                  <p className="leading-relaxed">
                    {selectedRole === 'superadmin'
                      ? 'Superadministrators receive elevated system rights to invite/manage administrators and inspect full security audit trails.'
                      : 'Administrators have operational access to update inventory, verify orders, and oversee counter payments.'}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading || !emailInput.trim()}
                    className={`px-5 py-2.5 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50 cursor-pointer ${
                      selectedRole === 'superadmin'
                        ? 'bg-purple-700 hover:bg-purple-800'
                        : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    {actionLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : selectedRole === 'superadmin' ? (
                      <Crown size={14} />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    <span>
                      {selectedRole === 'superadmin'
                        ? 'Generate Superadmin Link'
                        : 'Generate Admin Link'}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-700 mb-3">
              <ShieldAlert size={22} />
              <h3 className="font-extrabold text-slate-900 text-base font-display">Confirm Role Revocation</h3>
            </div>
            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Are you sure you want to revoke {revokeTarget.role === 'superadmin' ? 'Superadmin' : 'Administrator'} privileges for{' '}
              <strong className="text-slate-900 font-mono">{revokeTarget.email}</strong>? They will no longer be able
              to access the EMS Admin Panel.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Keep Access
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={actionLoading}
                className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
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
