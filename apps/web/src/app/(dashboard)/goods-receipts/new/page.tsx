'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import {
  PaginatedResponse,
  PurchaseOrderDto,
  PurchaseOrderStatus,
} from '@opstrace/shared-types';
import { SubmitGoodsReceiptSchema } from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';

interface ReceiptLineState {
  purchaseOrderItemId: string;
  productId: string;
  sku: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  conditionNotes: string;
}

function NewGoodsReceiptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPoId = searchParams.get('purchaseOrderId') ?? '';

  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000001',
  );
  const [orders, setOrders] = useState<PurchaseOrderDto[]>([]);
  const [selectedPoId, setSelectedPoId] = useState(initialPoId);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderDto | null>(null);
  const [receiptNumber, setReceiptNumber] = useState(
    () => `GR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
  );
  const [lines, setLines] = useState<ReceiptLineState[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<PaginatedResponse<PurchaseOrderDto>>(
          '/purchase-orders?limit=100',
        );
        const receivable = res.data.filter(
          (po) =>
            po.status === PurchaseOrderStatus.ISSUED ||
            po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED,
        );
        setOrders(receivable);
        if (!selectedPoId && receivable[0]) {
          setSelectedPoId(receivable[0].id);
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load purchase orders.',
        );
      } finally {
        setLoading(false);
      }
    };
    void fetchOrders();
  }, [selectedPoId]);

  useEffect(() => {
    if (!selectedPoId) {
      setSelectedPo(null);
      setLines([]);
      return;
    }

    const fetchPoDetail = async () => {
      try {
        const po = await apiClient.get<PurchaseOrderDto>(
          `/purchase-orders/${selectedPoId}`,
        );
        setSelectedPo(po);
        setLines(
          (po.items ?? []).map((item) => ({
            purchaseOrderItemId: item.id,
            productId: item.productId,
            sku: item.product?.sku ?? item.productId,
            productName: item.product?.name ?? 'Product',
            orderedQuantity: item.orderedQuantity,
            receivedQuantity: item.orderedQuantity,
            damagedQuantity: 0,
            conditionNotes: '',
          })),
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load PO details.',
        );
      }
    };
    void fetchPoDetail();
  }, [selectedPoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo) return;
    setError(null);

    const payload = {
      purchaseOrderId: selectedPo.id,
      warehouseId: selectedPo.warehouseId,
      receiptNumber,
      receivedAt: new Date(),
      idempotencyKey,
      items: lines.map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        productId: line.productId,
        receivedQuantity: Number(line.receivedQuantity),
        damagedQuantity: Number(line.damagedQuantity),
        conditionNotes: line.conditionNotes.trim() || undefined,
      })),
    };

    const parsed = SubmitGoodsReceiptSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid receiving inputs.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/goods-receipts', parsed.data);
      router.push(`/purchase-orders/${selectedPo.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to submit goods receipt.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/goods-receipts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Goods Receipts
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Record Goods Receipt
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Compare physical delivery counts against expected PO quantities.
          Idempotency key: <code className="text-xs">{idempotencyKey}</code>
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Purchase Order
            </label>
            <select
              disabled={loading}
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {orders.length === 0 ? (
                <option value="">No receivable POs available</option>
              ) : (
                orders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} ({po.status})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Receipt Number
            </label>
            <input
              type="text"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        {selectedPo && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Expected vs. Actual Line Items
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU / Product</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Received Qty</th>
                    <th className="px-4 py-3 text-right">Damaged Qty</th>
                    <th className="px-4 py-3 text-right">Accepted</th>
                    <th className="px-4 py-3">Condition Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const accepted =
                      Number(line.receivedQuantity) - Number(line.damagedQuantity);
                    return (
                      <tr key={line.purchaseOrderItemId}>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs font-semibold text-slate-900">
                            {line.sku}
                          </div>
                          <div className="text-xs text-slate-500">
                            {line.productName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {line.orderedQuantity}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            value={line.receivedQuantity}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = {
                                ...line,
                                receivedQuantity: Number(e.target.value),
                              };
                              setLines(next);
                            }}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm text-slate-900"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            value={line.damagedQuantity}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = {
                                ...line,
                                damagedQuantity: Number(e.target.value),
                              };
                              setLines(next);
                            }}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm text-slate-900"
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {accepted}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={line.conditionNotes}
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = {
                                ...line,
                                conditionNotes: e.target.value,
                              };
                              setLines(next);
                            }}
                            placeholder="Optional notes..."
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="submit"
                disabled={submitting || lines.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? 'Reconciling...' : 'Submit & Reconcile Receipt'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default function NewGoodsReceiptPage() {
  return (
    <Suspense
      fallback={<div className="text-sm text-slate-500">Loading form...</div>}
    >
      <NewGoodsReceiptContent />
    </Suspense>
  );
}
