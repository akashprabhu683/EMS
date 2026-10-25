import { httpsCallable } from 'firebase/functions';
import { collection, query, orderBy, limit, getDocs, startAfter, doc, getDoc, where } from 'firebase/firestore';
import { functions, db, auth } from '../firebase';
import type { AuditLogEntry } from '../types';

export interface AuditQueryOptions {
  action?: string;
  targetCollection?: string;
  pageSize?: number;
  lastDocId?: string;
}

/**
 * Loads audit logs through the trusted Cloud Function callable or Express backend API,
 * with direct Firestore query fallback.
 */
export async function getAuditTrail(options: AuditQueryOptions = {}): Promise<{ logs: AuditLogEntry[]; hasMore: boolean }> {
  const pageSize = options.pageSize || 30;

  // Refresh user token if signed in
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(false);
    } catch (e) {
      console.warn('[adminAuditService] Token refresh skipped:', e);
    }
  }

  // 1. Try secure Cloud Function callable
  try {
    const getAuditFn = httpsCallable<any, { logs: AuditLogEntry[]; count: number }>(functions, 'getAuditLogs');
    const result = await getAuditFn({
      action: options.action || undefined,
      targetCollection: options.targetCollection || undefined,
      limit: pageSize,
      startAfterId: options.lastDocId || undefined,
    });

    if (result.data && Array.isArray(result.data.logs)) {
      return {
        logs: result.data.logs,
        hasMore: result.data.logs.length >= pageSize,
      };
    }
  } catch (fnErr: any) {
    console.warn('[adminAuditService] getAuditLogs callable unavailable, falling back to Express API:', fnErr?.message || fnErr);
  }

  // 2. Try Express backend API (protected by requireAdminAuth and Firebase Admin SDK)
  const adminBackendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_ADMIN_API_URL;
  if (adminBackendUrl) {
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      const params = new URLSearchParams();
      if (options.action) params.set('action', options.action);
      if (options.targetCollection) params.set('targetCollection', options.targetCollection);
      if (options.pageSize) params.set('pageSize', String(options.pageSize));
      if (options.lastDocId) params.set('lastDocId', options.lastDocId);

      const res = await fetch(`${adminBackendUrl.replace(/\/$/, '')}/api/admin/audit-logs?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          logs: data.logs || [],
          hasMore: Boolean(data.hasMore),
        };
      }
    } catch (apiErr: any) {
      console.warn('[adminAuditService] Express backend audit API unavailable, falling back to direct Firestore read:', apiErr?.message || apiErr);
    }
  }

  // 3. Direct Firestore fallback (protected by Firestore security rules for admin)
  try {
    let q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));

    if (options.action) {
      q = query(q, where('action', '==', options.action));
    }
    if (options.targetCollection) {
      q = query(q, where('target.collection', '==', options.targetCollection));
    }

    if (options.lastDocId) {
      const snap = await getDoc(doc(db, 'audit_logs', options.lastDocId));
      if (snap.exists()) {
        q = query(q, startAfter(snap));
      }
    }

    q = query(q, limit(pageSize));
    const querySnapshot = await getDocs(q);

    const logs: AuditLogEntry[] = querySnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        action: data.action,
        actor: data.actor || { uid: 'unknown', role: 'admin' },
        target: data.target || { collection: 'orders', id: 'unknown' },
        summary: data.summary || '',
        changes: data.changes || undefined,
        metadata: data.metadata || undefined,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : String(data.timestamp || new Date().toISOString()),
      };
    });

    return {
      logs,
      hasMore: logs.length >= pageSize,
    };
  } catch (err) {
    console.error('[adminAuditService] Failed to load audit trail:', err);
    throw err;
  }
}

/**
 * Exports audit log entries as a CSV file.
 */
export function exportAuditLogsCsv(logs: AuditLogEntry[]): void {
  const headers = ['Timestamp (UTC)', 'Action', 'Actor Email / UID', 'Target Collection', 'Target ID', 'Summary'];
  const rows = logs.map((log) => [
    `"${log.timestamp}"`,
    `"${log.action}"`,
    `"${log.actor.email || log.actor.uid}"`,
    `"${log.target.collection}"`,
    `"${log.target.id}"`,
    `"${log.summary.replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EMS_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
