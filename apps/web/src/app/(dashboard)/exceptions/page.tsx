'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, Eye } from 'lucide-react';
import {
  ExceptionDto,
  ExceptionStatus,
  PaginatedResponse,
} from '@opstrace/shared-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { PaginationBar } from '@/components/ui/PaginationBar';

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Open', value: ExceptionStatus.OPEN },
  { label: 'Investigating', value: ExceptionStatus.INVESTIGATING },
  { label: 'Resolved', value: ExceptionStatus.RESOLVED },
  { label: 'Dismissed', value: ExceptionStatus.DISMISSED },
];

const SEVERITY_BADGE: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-700',
  MEDIUM: 'bg-amber-50 text-amber-800',
  HIGH: 'bg-orange-50 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

function formatAging(detectedAt: Date | string): { text: string; overdue: boolean } {
  const diffMs = Date.now() - new Date(detectedAt).getTime();
  const hours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (hours < 24) {
    return { text: `${hours}h`, overdue: false };
  }
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, overdue: days >= 3 };
}

export default function ExceptionsPage() {
  const [items, setItems] = useState<ExceptionDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [statusTab, setStatusTab] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (statusTab) params.set('status', statusTab);

      const res = await apiClient.get<PaginatedResponse<ExceptionDto>>(
        `/exceptions?${params.toString()}`,
      );
      setItems(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load exceptions.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, statusTab]);

  useEffect(() => {
    void loadExceptions();
  }, [loadExceptions]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Exception Management Center
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Investigate and resolve operational discrepancies detected by OpsTrace.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {STATUS_TABS.map((tab) => {
          const active = statusTab === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setStatusTab(tab.value);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Exception #</th>
                <th className="px-4 py-3">Title &amp; Category</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">SLA Aging</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading exceptions...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No exceptions found for this filter.
                  </td>
                </tr>
              ) : (
                items.map((exc) => {
                  const aging = formatAging(exc.detectedAt);
                  const isTerminal =
                    exc.status === ExceptionStatus.RESOLVED ||
                    exc.status === ExceptionStatus.DISMISSED ||
                    exc.status === ExceptionStatus.CLOSED;

                  return (
                    <tr key={exc.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                        <Link
                          href={`/exceptions/${exc.id}`}
                          className="hover:underline"
                        >
                          {exc.exceptionNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {exc.title}
                        </div>
                        <div className="text-xs text-slate-500">{exc.category}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            SEVERITY_BADGE[exc.severity] ?? 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {exc.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                          {exc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isTerminal ? (
                          <span className="text-xs text-slate-400">Closed</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              aging.overdue ? 'text-red-600' : 'text-slate-600'
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            {aging.text}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/exceptions/${exc.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Investigate
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar meta={meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
