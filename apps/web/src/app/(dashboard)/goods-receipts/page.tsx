'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Plus } from 'lucide-react';
import { GoodsReceiptDto, PaginatedResponse } from '@opstrace/shared-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

export default function GoodsReceiptsPage() {
  const { hasPermission } = useAuth();
  const canSubmit = hasPermission('receipt:submit');

  const [items, setItems] = useState<GoodsReceiptDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PaginatedResponse<GoodsReceiptDto>>(
        `/goods-receipts?page=${page}&limit=10`,
      );
      setItems(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load goods receipts.',
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Goods Receipts
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Physical receiving records reconciled against Purchase Orders.
          </p>
        </div>

        {canSubmit && (
          <Link
            href="/goods-receipts/new"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Record Goods Receipt
          </Link>
        )}
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
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Purchase Order</th>
                <th className="px-4 py-3">Received At</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Line Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading goods receipts...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No goods receipts recorded yet.
                  </td>
                </tr>
              ) : (
                items.map((gr) => (
                  <tr key={gr.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {gr.receiptNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">
                      <Link
                        href={`/purchase-orders/${gr.purchaseOrderId}`}
                        className="hover:underline"
                      >
                        {gr.purchaseOrderId.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(gr.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        {gr.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {gr.items?.length ?? 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar meta={meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
