'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  PackageCheck,
  Send,
} from 'lucide-react';
import {
  GoodsReceiptDto,
  PaginatedResponse,
  PurchaseOrderDto,
  PurchaseOrderStatus,
} from '@opstrace/shared-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const poId = params.id;
  const { hasPermission } = useAuth();

  const [po, setPo] = useState<PurchaseOrderDto | null>(null);
  const [receipts, setReceipts] = useState<GoodsReceiptDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [poRes, grRes] = await Promise.all([
        apiClient.get<PurchaseOrderDto>(`/purchase-orders/${poId}`),
        apiClient.get<PaginatedResponse<GoodsReceiptDto>>(
          `/goods-receipts?purchaseOrderId=${poId}&limit=50`,
        ),
      ]);
      setPo(poRes);
      setReceipts(grRes.data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load purchase order.',
      );
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: 'issue' | 'cancel') => {
    setActing(true);
    setError(null);
    try {
      await apiClient.patch(`/purchase-orders/${poId}/${action}`);
      await loadDetail();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action} PO.`);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading Purchase Order...</div>;
  }

  if (!po) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || 'Purchase Order not found.'}
      </div>
    );
  }

  const summary = po.summary ?? {
    ordered: 0,
    received: 0,
    damaged: 0,
    accepted: 0,
    outstanding: 0,
  };

  const canIssue =
    po.status === PurchaseOrderStatus.DRAFT && hasPermission('po:create');
  const canCancel =
    (po.status === PurchaseOrderStatus.DRAFT ||
      po.status === PurchaseOrderStatus.ISSUED) &&
    hasPermission('po:cancel');
  const canReceive =
    (po.status === PurchaseOrderStatus.ISSUED ||
      po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) &&
    hasPermission('receipt:submit');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/purchase-orders"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Purchase Orders
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {po.poNumber}
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
              {po.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Supplier: <span className="font-medium">{po.supplier?.name}</span> •
            Warehouse:{' '}
            <span className="font-medium">
              {po.warehouse?.code} ({po.warehouse?.name})
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canIssue && (
            <button
              type="button"
              disabled={acting}
              onClick={() => void handleAction('issue')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Issue PO
            </button>
          )}
          {canReceive && (
            <Link
              href={`/goods-receipts/new?purchaseOrderId=${po.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <PackageCheck className="h-4 w-4" />
              Record Goods Receipt
            </Link>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={acting}
              onClick={() => void handleAction('cancel')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Ban className="h-4 w-4" />
              Cancel PO
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: 'Ordered', value: summary.ordered, color: 'text-slate-900' },
          { label: 'Received', value: summary.received, color: 'text-blue-700' },
          { label: 'Damaged', value: summary.damaged, color: 'text-red-700' },
          { label: 'Accepted', value: summary.accepted, color: 'text-emerald-700' },
          { label: 'Outstanding', value: summary.outstanding, color: 'text-amber-700' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              {card.label}
            </div>
            <div className={`mt-1 text-2xl font-bold ${card.color}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Line-item table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Contracted Line Items
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3 text-right">Ordered Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(po.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                    {item.product?.sku ?? item.productId}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.product?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.product?.unitOfMeasure ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {item.orderedQuantity}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">
                    {item.unitPrice}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linked Goods Receipts */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Linked Goods Receipts ({receipts.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Receipt #</th>
                <th className="px-4 py-3">Received At</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No goods receipts submitted yet.
                  </td>
                </tr>
              ) : (
                receipts.map((gr) => (
                  <tr key={gr.id}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {gr.receiptNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(gr.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
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
      </div>
    </div>
  );
}
