import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  IndianRupee,
  Calendar,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  fetchOperationalReport,
  exportDailyCollectionsCsv,
  STORE_TIMEZONE,
  formatIstDateKey,
} from '../services/adminReportService';
import type { OperationalReportData } from '../types';

export function OperationalReportsPage() {
  const toast = useToast();
  const [report, setReport] = useState<OperationalReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | '7days' | 'month'>('7days');

  const loadReport = async (preset = datePreset) => {
    setLoading(true);
    try {
      const now = new Date();
      let filter: { startDate?: string; endDate?: string } | undefined;

      if (preset === 'today') {
        const todayStr = formatIstDateKey(now);
        filter = { startDate: todayStr, endDate: todayStr };
      } else if (preset === '7days') {
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filter = { startDate: formatIstDateKey(past), endDate: formatIstDateKey(now) };
      } else if (preset === 'month') {
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filter = { startDate: formatIstDateKey(past), endDate: formatIstDateKey(now) };
      }

      const data = await fetchOperationalReport(filter);
      setReport(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load operational report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(datePreset);
  }, [datePreset]);

  const handleExportDailyCsv = () => {
    if (!report || report.dailyCollections.length === 0) {
      toast.error('No daily collection records available to export.');
      return;
    }
    exportDailyCollectionsCsv(report.dailyCollections);
    toast.success('Daily collections CSV downloaded.');
  };

  const handleExportFullReport = () => {
    if (!report) return;
    const summaryRows = [
      ['Metric', 'Value'],
      ['Store Timezone', report.timezone],
      ['Generated At', report.generatedAt],
      ['Total Orders Processed', report.orders.totalOrders],
      ['Active Pipeline Orders', report.orders.activeOrders],
      ['Actual In-Person Payments Received (INR)', report.financials.confirmedCashRupees.toFixed(2)],
      ['Confirmed Payments Count', report.financials.confirmedPaymentsCount],
      ['Outstanding / Uncollected Amounts (INR)', report.financials.outstandingUnpaidRupees.toFixed(2)],
      ['Gross Pipeline Order Value (INR)', report.financials.grossPipelineRupees.toFixed(2)],
      ['Cancelled Orders Value (INR)', report.financials.cancelledRupees.toFixed(2)],
      ['Total Catalog Stock Units', report.inventory.totalStockUnits],
      ['Total Stock Inventory Valuation (INR)', report.inventory.totalStockValuationRupees.toFixed(2)],
      ['Low Stock Alert Items', report.inventory.lowStockItems],
      ['Out of Stock Items', report.inventory.outOfStockItems],
      ['Reconciliation Discrepancies Count', report.reconciliation.discrepancyCount],
    ];

    const csvContent = summaryRows.map((r) => `"${r[0]}","${r[1]}"`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EMS_Operational_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Operational summary CSV downloaded.');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
              Dispensary Operational Intelligence
            </span>
            <span className="text-xs text-slate-400 font-medium ml-1">
              Timezone: {STORE_TIMEZONE} (IST)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Operational &amp; Financial Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Authoritative tracking for Click &amp; Collect dispensary orders, actual in-person counter cash receipts, inventory thresholds, and financial reconciliation.
          </p>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => loadReport(datePreset)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportDailyCsv}
            disabled={loading || !report}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors"
          >
            <FileSpreadsheet size={14} />
            <span>Daily Collections CSV</span>
          </button>
          <button
            onClick={handleExportFullReport}
            disabled={loading || !report}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
          >
            <Download size={14} />
            <span>Export Full Summary</span>
          </button>
        </div>
      </div>

      {/* Date Preset Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2 flex items-center gap-1">
          <Calendar size={14} />
          <span>Period:</span>
        </span>
        {[
          { key: 'all', label: 'All Time' },
          { key: 'today', label: 'Today (IST)' },
          { key: '7days', label: 'Last 7 Days' },
          { key: 'month', label: 'Last 30 Days' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setDatePreset(item.key as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              datePreset === item.key
                ? 'bg-emerald-700 text-white shadow-xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {report?.meta?.isTruncated && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-900 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={18} />
          <div className="text-xs sm:text-sm">
            <span className="font-bold block mb-0.5">Order Query Ceiling Reached</span>
            <p>{report.meta.warning || 'Displaying the latest 5,000 orders. Please select a narrower date range (e.g. Today, Last 7 Days, or Last 30 Days) for complete metrics.'}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-500">Calculating authoritative financial aggregates &amp; inventory state…</p>
        </div>
      ) : report ? (
        <>
          {/* Top Key Financial & Inventory Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* 1. Confirmed Cash Collected */}
            <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Confirmed Cash Received
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <IndianRupee size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                ₹{report.financials.confirmedCashRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-600 inline" />
                <span>{report.financials.confirmedPaymentsCount} in-person payments recorded by staff</span>
              </p>
            </div>

            {/* 2. Outstanding Counter Payments */}
            <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  Outstanding at Counter
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Clock size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                ₹{report.financials.outstandingUnpaidRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Awaiting counter settlement on active orders
              </p>
            </div>

            {/* 3. Gross Pipeline Order Value */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Gross Active Pipeline
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <TrendingUp size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                ₹{report.financials.grossPipelineRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Total value across {report.orders.activeOrders} active orders
              </p>
            </div>

            {/* 4. Inventory Valuation & Stock Alerts */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Inventory Valuation
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Package size={16} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
                ₹{report.inventory.totalStockValuationRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-2">
                <span>{report.inventory.totalStockUnits} units in catalog</span>
                {report.inventory.lowStockItems + report.inventory.outOfStockItems > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {report.inventory.lowStockItems + report.inventory.outOfStockItems} alerts
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Fulfilment Lifecycle Pipeline Cards */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-700" />
              <span>Fulfilment Lifecycle Breakdown</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Placed', count: report.orders.placed.count, paise: report.orders.placed.totalPaise, color: 'border-slate-200' },
                { label: 'Awaiting Prep', count: report.orders.awaitingPreparation.count, paise: report.orders.awaitingPreparation.totalPaise, color: 'border-blue-200' },
                { label: 'Preparing', count: report.orders.inPreparation.count, paise: report.orders.inPreparation.totalPaise, color: 'border-indigo-200' },
                { label: 'Ready for Pickup', count: report.orders.readyForPickup.count, paise: report.orders.readyForPickup.totalPaise, color: 'border-amber-200' },
                { label: 'Collected', count: report.orders.collected.count, paise: report.orders.collected.totalPaise, color: 'border-emerald-200' },
                { label: 'Cancelled', count: report.orders.cancelled.count, paise: report.orders.cancelled.totalPaise, color: 'border-rose-200' },
              ].map((s) => (
                <div key={s.label} className={`bg-white rounded-xl border ${s.color} p-4 shadow-2xs`}>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    {s.label}
                  </span>
                  <p className="text-xl font-extrabold text-slate-900 font-display">{s.count}</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">₹{(s.paise / 100).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Two-Column Section: Daily Collections & Stock Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily In-Person Collections (IST) */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Daily In-Person Collections (IST)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Counter cash and in-person settlements by date</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {report.dailyCollections.length} recording days
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                {report.dailyCollections.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No confirmed payments recorded for this period.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Date (IST)</th>
                        <th className="py-3 px-4 text-center">Orders</th>
                        <th className="py-3 px-4 text-right">Cash Received</th>
                        <th className="py-3 px-4">Staff Confirming</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.dailyCollections.map((day) => (
                        <tr key={day.date} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900 font-mono">{day.date}</td>
                          <td className="py-3 px-4 text-center font-semibold text-slate-700">{day.ordersCollected}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700 font-display">
                            ₹{day.cashCollectedRupees.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-slate-500 truncate max-w-[160px]" title={day.staffActors.join(', ')}>
                            {day.staffActors.length > 0 ? day.staffActors.join(', ') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Low-Stock and Out-of-Stock Alert Watchlist */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Inventory Threshold Alerts</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Authoritative stock depletion based on product thresholds</p>
                </div>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                  {report.inventory.lowStockAlerts.length} items flagged
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                {report.inventory.lowStockAlerts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    All products are comfortably above their low-stock thresholds.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Product Name</th>
                        <th className="py-3 px-4 text-center">Current</th>
                        <th className="py-3 px-4 text-center">Threshold</th>
                        <th className="py-3 px-4 text-right">Unit Price</th>
                        <th className="py-3 px-4">Alert</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.inventory.lowStockAlerts.map((item) => (
                        <tr key={item.productId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900 truncate max-w-[180px]" title={item.name}>
                            {item.name}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900">{item.currentStock}</td>
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">{item.threshold}</td>
                          <td className="py-3 px-4 text-right text-slate-600 font-mono">₹{(item.pricePaise / 100).toFixed(2)}</td>
                          <td className="py-3 px-4">
                            {item.currentStock === 0 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                Out of Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Low Stock
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Reconciliation & Integrity Status Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {report.reconciliation.discrepancyCount === 0 ? (
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <ShieldCheck size={18} />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                    <ShieldAlert size={18} />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reconciliation &amp; Financial Discrepancy Detector</h3>
                  <p className="text-xs text-slate-400">Automatic reconciliation cross-checking fulfilment status vs payment status</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  report.reconciliation.discrepancyCount === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {report.reconciliation.discrepancyCount === 0
                  ? 'All Records In Complete Sync'
                  : `${report.reconciliation.discrepancyCount} Flagged For Staff Review`}
              </span>
            </div>

            {report.reconciliation.discrepancyCount === 0 ? (
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-emerald-800 flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>
                  No reconciliation discrepancies found. All collected orders have verified payment records, and cancelled orders have had inventory restored accurately.
                </span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {report.reconciliation.discrepancies.map((d, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                      d.severity === 'high'
                        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}
                  >
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold font-mono mr-2">[{d.type}]</span>
                      <span>{d.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
