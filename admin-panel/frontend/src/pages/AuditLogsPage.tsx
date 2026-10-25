import React, { useEffect, useState } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldAlert,
  AlertCircle,
  Package,
  ShoppingCart,
  IndianRupee,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { getAuditTrail, exportAuditLogsCsv } from '../services/adminAuditService';
import type { AuditLogEntry, AuditAction } from '../types';

export function AuditLogsPage() {
  const toast = useToast();
  const { refreshClaims } = useAdminAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLogs = async (isInitial = true, forceRefresh = false) => {
    setLoading(true);
    if (isInitial) {
      setPermissionDenied(false);
      setErrorMessage(null);
    }
    if (forceRefresh) {
      try {
        await refreshClaims();
      } catch (e) {
        console.warn('Refreshing claims during retry failed:', e);
      }
    }
    try {
      const lastDocId = !isInitial && logs.length > 0 ? logs[logs.length - 1].id : undefined;
      const res = await getAuditTrail({
        action: actionFilter !== 'all' ? actionFilter : undefined,
        targetCollection: collectionFilter !== 'all' ? collectionFilter : undefined,
        pageSize: 40,
        lastDocId,
      });

      if (isInitial) {
        setLogs(res.logs);
      } else {
        setLogs((prev) => [...prev, ...res.logs]);
      }
      setHasMore(res.hasMore);
      setPermissionDenied(false);
      setErrorMessage(null);
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to load audit logs.';
      const isPerm =
        err?.code === 'permission-denied' ||
        err?.status === 403 ||
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('missing or insufficient');

      if (isPerm) {
        setPermissionDenied(true);
        setErrorMessage('Missing or insufficient permissions to view audit trail. Administrator role required.');
      } else {
        setErrorMessage(errMsg);
      }
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(true);
  }, [actionFilter, collectionFilter]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      log.summary.toLowerCase().includes(query) ||
      log.target.id.toLowerCase().includes(query) ||
      (log.target.label && log.target.label.toLowerCase().includes(query)) ||
      (log.actor.email && log.actor.email.toLowerCase().includes(query)) ||
      log.action.toLowerCase().includes(query)
    );
  });

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs available to export.');
      return;
    }
    exportAuditLogsCsv(filteredLogs);
    toast.success('Audit trail CSV downloaded.');
  };

  const getActionBadge = (action: AuditAction) => {
    if (action.startsWith('PAYMENT_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <IndianRupee size={11} />
          <span>{action.replace(/_/g, ' ')}</span>
        </span>
      );
    }
    if (action.startsWith('ORDER_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
          <ShoppingCart size={11} />
          <span>{action.replace(/_/g, ' ')}</span>
        </span>
      );
    }
    if (action.startsWith('INVENTORY_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
          <Layers size={11} />
          <span>{action.replace(/_/g, ' ')}</span>
        </span>
      );
    }
    if (action.startsWith('PRODUCT_')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
          <Package size={11} />
          <span>{action.replace(/_/g, ' ')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
        <Shield size={11} />
        <span>{action.replace(/_/g, ' ')}</span>
      </span>
    );
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200/80">
              Tamper-Resistant Security Trail
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Administrative Audit Trail
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Append-only historical verification logs for inventory deduction, order transitions, PIN collection validations, in-person cash payments, and administrator role grants.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => loadLogs(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={loading || filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by summary, Order ID, Product name, or Actor email..."
            className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Action Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full sm:w-auto max-w-full truncate px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-indigo-600 cursor-pointer"
          >
            <option value="all">All Actions</option>
            <option value="ORDER_STATUS_CHANGED">Order Status Changed</option>
            <option value="ORDER_COLLECTED">Order Collected (PIN Verified)</option>
            <option value="ORDER_CANCELLED">Order Cancelled</option>
            <option value="PAYMENT_RECORDED">Payment Recorded (Counter)</option>
            <option value="PAYMENT_CORRECTED">Payment Corrected</option>
            <option value="INVENTORY_DEDUCTED">Inventory Deducted</option>
            <option value="INVENTORY_RESTORED">Inventory Restored</option>
            <option value="PRODUCT_UPDATED">Product Updated</option>
            <option value="INVENTORY_ADJUSTED">Inventory Adjusted</option>
            <option value="ADMIN_ROLE_GRANTED">Admin Role Granted</option>
            <option value="ADMIN_ROLE_REVOKED">Admin Role Revoked</option>
            <option value="ADMIN_INVITED">Admin Invited</option>
          </select>

          <select
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
            className="w-full sm:w-auto max-w-full truncate px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:border-indigo-600 cursor-pointer"
          >
            <option value="all">All Collections</option>
            <option value="orders">orders</option>
            <option value="products">products</option>
            <option value="admins">admins</option>
            <option value="admin_invitations">admin_invitations</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-indigo-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Querying append-only audit trail...</p>
          </div>
        ) : permissionDenied ? (
          <div className="py-16 px-4 text-center max-w-md mx-auto">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200">
              <ShieldAlert size={28} />
            </div>
            <p className="text-sm font-bold text-slate-800">Missing or Insufficient Permissions</p>
            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
              Your account does not have verified administrative access to read the audit log stream. Contact a store super admin or re-authenticate.
            </p>
            <button
              onClick={() => loadLogs(true, true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-colors"
            >
              <RefreshCw size={13} />
              <span>Retry Authorization</span>
            </button>
          </div>
        ) : errorMessage && logs.length === 0 ? (
          <div className="py-16 px-4 text-center max-w-md mx-auto">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-rose-200">
              <AlertCircle size={28} />
            </div>
            <p className="text-sm font-bold text-slate-800">Unable to Load Audit Records</p>
            <p className="text-xs text-rose-600 mt-1 mb-4 leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => loadLogs(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors"
            >
              <RefreshCw size={13} />
              <span>Retry Query</span>
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <History size={36} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No audit records match your filters.</p>
            <p className="text-xs text-slate-400 mt-1">Actions performed on orders, products, and admin accounts will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-8" />
                  <th className="py-3 px-4">Timestamp (IST)</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Record</th>
                  <th className="py-3 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = (log.changes && log.changes.length > 0) || (log.metadata && Object.keys(log.metadata).length > 0);

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                        className={`transition-colors ${hasDetails ? 'cursor-pointer hover:bg-slate-50/80' : ''} ${
                          isExpanded ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-slate-400">
                          {hasDetails ? (
                            isExpanded ? (
                              <ChevronDown size={14} className="text-indigo-600" />
                            ) : (
                              <ChevronRight size={14} />
                            )
                          ) : null}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">{getActionBadge(log.action)}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-semibold text-slate-800 block truncate max-w-[140px]" title={log.actor.email || log.actor.uid}>
                            {log.actor.email || log.actor.uid}
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase font-mono">{log.actor.role}</span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-medium mr-1.5">
                            {log.target.collection}
                          </span>
                          <span className="text-slate-600 font-medium">{log.target.label || log.target.id}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">
                          {log.summary}
                        </td>
                      </tr>

                      {/* Expandable Diffs & Metadata View */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60 border-b border-indigo-100">
                          <td colSpan={6} className="p-4 sm:p-5">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span>Authoritative Audit Record Details</span>
                                <span className="font-mono text-[10px] text-slate-400">Log ID: {log.id}</span>
                              </div>

                              {log.changes && log.changes.length > 0 && (
                                <div>
                                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                    Before &amp; After Field Modifications:
                                  </span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {log.changes.map((c, idx) => (
                                      <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                                        <span className="font-bold text-slate-800 block font-mono text-[11px]">{c.field}</span>
                                        <div className="flex items-center gap-1.5 text-slate-600 mt-1">
                                          <span className="line-through text-slate-400">{String(c.before)}</span>
                                          <ArrowRight size={12} className="text-slate-400" />
                                          <span className="font-bold text-emerald-700">{String(c.after)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div>
                                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Contextual Metadata:
                                  </span>
                                  <pre className="bg-slate-900 text-slate-200 p-3 rounded-lg text-[11px] font-mono overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="p-4 border-t border-slate-100 text-center">
            <button
              onClick={() => loadLogs(false)}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              {loading ? 'Loading older entries…' : 'Load More Audit Entries'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
