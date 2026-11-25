'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { AuditAction, AuditLogDto, PaginatedResponse } from '@opstrace/shared-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { PaginationBar } from '@/components/ui/PaginationBar';

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-blue-50 text-blue-700',
  UPDATE: 'bg-slate-100 text-slate-700',
  DELETE: 'bg-red-50 text-red-700',
  RECONCILE: 'bg-indigo-50 text-indigo-700',
  RESOLVE: 'bg-emerald-50 text-emerald-700',
  ASSIGN: 'bg-amber-50 text-amber-700',
  SYNC: 'bg-purple-50 text-purple-700',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (entityType.trim()) params.set('entityType', entityType.trim());
      if (action) params.set('action', action);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);

      const res = await apiClient.get<PaginatedResponse<AuditLogDto>>(
        `/audit-logs?${params.toString()}`,
      );
      setLogs(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load audit logs.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, entityType, action, fromDate, toDate]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Immutable Audit Trail
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Read-only compliance log of every operational write and reconciliation
          event.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
        <input
          type="text"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          placeholder="Entity type (e.g. Exception, GoodsReceipt)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
        />

        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
        >
          <option value="">All Actions</option>
          {Object.values(AuditAction).map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
        />
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
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3 text-right">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No audit entries match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isOpen = expandedId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-900">
                          {log.actor
                            ? `${log.actor.firstName} ${log.actor.lastName}`
                            : log.actorUserId ?? 'System'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              ACTION_BADGE[log.action] ?? 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-semibold text-slate-900">
                            {log.entityType}
                          </span>{' '}
                          <span className="font-mono text-slate-500">
                            {log.entityId.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isOpen ? null : log.id)
                            }
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            JSON
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-4 py-3">
                            <pre className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                              {JSON.stringify(log.metadata ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
