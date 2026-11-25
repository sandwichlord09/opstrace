'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Plus,
  X,
} from 'lucide-react';
import {
  PaginatedResponse,
  ProductDto,
  StockInspectionDto,
  StockInspectionStatus,
  WarehouseDto,
} from '@opstrace/shared-types';
import { SubmitStockInspectionSchema } from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

export default function StockInspectionsPage() {
  const { hasPermission } = useAuth();
  const canPerform = hasPermission('inspection:perform');
  const canReview = hasPermission('inspection:review');

  const [items, setItems] = useState<StockInspectionDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    physicalQuantity: '',
    notes: '',
  });
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (warehouseFilter) params.set('warehouseId', warehouseFilter);
      if (statusFilter) params.set('status', statusFilter);

      const [inspRes, whRes] = await Promise.all([
        apiClient.get<PaginatedResponse<StockInspectionDto>>(
          `/stock-inspections?${params.toString()}`,
        ),
        apiClient.get<PaginatedResponse<WarehouseDto>>('/warehouses?limit=100'),
      ]);
      setItems(inspRes.data);
      setMeta(inspRes.meta);
      setWarehouses(whRes.data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load stock inspections.',
      );
    } finally {
      setLoading(false);
    }
  }, [page, warehouseFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openModal = async () => {
    setModalError(null);
    setModalOpen(true);
    setIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-000000000001',
    );
    try {
      const prodRes = await apiClient.get<PaginatedResponse<ProductDto>>(
        '/products?limit=100',
      );
      setProducts(prodRes.data);
      setForm({
        warehouseId: warehouses[0]?.id ?? '',
        productId: prodRes.data[0]?.id ?? '',
        physicalQuantity: '',
        notes: '',
      });
    } catch (err) {
      setModalError(
        err instanceof ApiError ? err.message : 'Failed to load products.',
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const payload = {
      warehouseId: form.warehouseId,
      productId: form.productId,
      physicalQuantity: Number(form.physicalQuantity),
      inspectedAt: new Date(),
      notes: form.notes.trim() || undefined,
      idempotencyKey,
    };

    const parsed = SubmitStockInspectionSchema.safeParse(payload);
    if (!parsed.success) {
      setModalError(
        parsed.error.issues[0]?.message ?? 'Invalid inspection inputs.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/stock-inspections', parsed.data);
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(
        err instanceof ApiError
          ? err.message
          : 'Failed to submit stock inspection.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    setError(null);
    try {
      await apiClient.post(`/stock-inspections/${id}/approve`);
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to approve inspection.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Stock Inspections
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Physical cycle counts reconciled against recorded inventory
            snapshots.
          </p>
        </div>

        {canPerform && (
          <button
            type="button"
            onClick={() => void openModal()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Record Stock Inspection
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={warehouseFilter}
          onChange={(e) => {
            setWarehouseFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">All Warehouses</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.code} — {wh.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">All Variance Statuses</option>
          <option value={StockInspectionStatus.DISCREPANCY_FLAGGED}>
            Discrepancy Only
          </option>
          <option value={StockInspectionStatus.ACCEPTED}>
            Exact Match / Accepted
          </option>
          <option value={StockInspectionStatus.PENDING_REVIEW}>
            Pending Review
          </option>
        </select>
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
                <th className="px-4 py-3">Inspection Date</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Recorded</th>
                <th className="px-4 py-3 text-right">Physical</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3">Inspector</th>
                <th className="px-4 py-3">Status</th>
                {canReview && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={canReview ? 9 : 8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Loading stock inspections...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={canReview ? 9 : 8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No stock inspections recorded yet.
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const hasVariance = row.variance !== 0;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {new Date(row.inspectedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.warehouse
                          ? `${row.warehouse.code} — ${row.warehouse.name}`
                          : row.warehouseId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {row.product?.sku ?? row.productId.slice(0, 8)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.product?.name ?? ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {row.recordedQuantity}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {row.physicalQuantity}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            !hasVariance
                              ? 'bg-emerald-50 text-emerald-700'
                              : row.variance < 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {row.variance > 0 ? `+${row.variance}` : row.variance}
                        </span>
                        {row.exceptionId && (
                          <Link
                            href={`/exceptions/${row.exceptionId}`}
                            className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-indigo-600 hover:underline"
                          >
                            Exception
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {row.inspector
                          ? `${row.inspector.firstName} ${row.inspector.lastName}`
                          : row.performedBy.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.status === StockInspectionStatus.ACCEPTED
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      {canReview && (
                        <td className="px-4 py-3 text-right">
                          {row.status !== StockInspectionStatus.ACCEPTED && (
                            <button
                              type="button"
                              onClick={() => void handleApprove(row.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Approve
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar meta={meta} onPageChange={setPage} />
      </div>

      {/* Record Stock Inspection Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Record Stock Inspection
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Warehouse
                </label>
                <select
                  value={form.warehouseId}
                  onChange={(e) =>
                    setForm({ ...form, warehouseId: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.code} — {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Product
                </label>
                <select
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value })
                  }
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Physical Counted Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.physicalQuantity}
                  onChange={(e) =>
                    setForm({ ...form, physicalQuantity: e.target.value })
                  }
                  placeholder="0"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Compared server-side against the latest inventory snapshot.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional aisle/bin observations..."
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
