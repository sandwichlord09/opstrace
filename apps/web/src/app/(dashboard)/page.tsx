'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
} from 'lucide-react';
import {
  AnalyticsDiscrepanciesDto,
  AnalyticsOverviewDto,
} from '@opstrace/shared-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

export default function OverviewPage() {
  const { user, hasPermission } = useAuth();
  const canViewReports = hasPermission('reports:view');

  const [overview, setOverview] = useState<AnalyticsOverviewDto | null>(null);
  const [discrepancies, setDiscrepancies] =
    useState<AnalyticsDiscrepanciesDto | null>(null);
  const [loading, setLoading] = useState(canViewReports);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewReports) {
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, disc] = await Promise.all([
          apiClient.get<AnalyticsOverviewDto>('/analytics/overview'),
          apiClient.get<AnalyticsDiscrepanciesDto>('/analytics/discrepancies'),
        ]);
        setOverview(ov);
        setDiscrepancies(disc);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load analytics.',
        );
      } finally {
        setLoading(false);
      }
    };

    void fetchAnalytics();
  }, [canViewReports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operations Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Welcome back, {user?.firstName}. Real-time operational reconciliation
            and discrepancy intelligence for {user?.organizationName}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/purchase-orders"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Purchase Orders
          </Link>
          <Link
            href="/exceptions"
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Exceptions Center
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!canViewReports ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Analytics dashboards are restricted to Manager, Supervisor, and
          Auditor roles. Use the sidebar to record Goods Receipts or view
          assigned Exceptions.
        </div>
      ) : loading ? (
        <div className="text-sm text-slate-500">Loading analytics KPIs...</div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Active Purchase Orders</span>
                <ClipboardList className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">
                {overview?.activePurchaseOrders ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Issued &amp; partially received
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Open Exceptions</span>
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">
                {overview?.openExceptionsBySeverity.total ?? 0}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-medium">
                <span className="text-red-700">
                  CRIT: {overview?.openExceptionsBySeverity.CRITICAL ?? 0}
                </span>
                <span className="text-orange-700">
                  HIGH: {overview?.openExceptionsBySeverity.HIGH ?? 0}
                </span>
                <span className="text-amber-700">
                  MED: {overview?.openExceptionsBySeverity.MEDIUM ?? 0}
                </span>
                <span className="text-slate-600">
                  LOW: {overview?.openExceptionsBySeverity.LOW ?? 0}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Received vs. Damaged</span>
                <PackageCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">
                {overview?.totalReceivedUnits ?? 0}
              </div>
              <p className="mt-1 text-xs text-red-600">
                {overview?.totalDamagedUnits ?? 0} damaged units quarantined
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Stock Accuracy Rate</span>
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900">
                {overview?.stockAccuracyRate ?? 100}%
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Zero-variance cycle counts
              </p>
            </div>
          </div>

          {/* Aging Buckets */}
          {discrepancies && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Open Exception Aging Buckets
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  {
                    label: '< 24 Hours',
                    count: discrepancies.exceptionAgingBuckets.under24h,
                    cls: 'bg-slate-50 text-slate-900',
                  },
                  {
                    label: '1 – 3 Days',
                    count: discrepancies.exceptionAgingBuckets.days1To3,
                    cls: 'bg-amber-50 text-amber-900',
                  },
                  {
                    label: '3 – 7 Days',
                    count: discrepancies.exceptionAgingBuckets.days3To7,
                    cls: 'bg-orange-50 text-orange-900',
                  },
                  {
                    label: '> 7 Days',
                    count: discrepancies.exceptionAgingBuckets.over7d,
                    cls: 'bg-red-50 text-red-900',
                  },
                ].map((bucket) => (
                  <div
                    key={bucket.label}
                    className={`rounded-lg p-3 ${bucket.cls}`}
                  >
                    <div className="text-xs font-medium opacity-80">
                      {bucket.label}
                    </div>
                    <div className="mt-1 text-2xl font-bold">{bucket.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier & Warehouse Breakdowns */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Discrepancy Frequency by Supplier
                </h2>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5 text-right">Exceptions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!discrepancies || discrepancies.bySupplier.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                        No supplier discrepancies recorded.
                      </td>
                    </tr>
                  ) : (
                    discrepancies.bySupplier.map((sup) => (
                      <tr key={sup.supplierId}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {sup.supplierName}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-red-700">
                          {sup.exceptionCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Warehouse Inspection Variance
                </h2>
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Warehouse</th>
                    <th className="px-4 py-2.5 text-right">Inspections</th>
                    <th className="px-4 py-2.5 text-right">Variances</th>
                    <th className="px-4 py-2.5 text-right">Abs. Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!discrepancies || discrepancies.byWarehouse.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No warehouse inspection data yet.
                      </td>
                    </tr>
                  ) : (
                    discrepancies.byWarehouse.map((wh) => (
                      <tr key={wh.warehouseId}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {wh.warehouseCode} — {wh.warehouseName}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {wh.inspectionCount}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-700">
                          {wh.varianceCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                          {wh.totalAbsoluteVariance}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
