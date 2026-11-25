'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ImportJobDto,
  PaginatedResponse,
  ProductDto,
  PurchaseOrderDto,
  PurchaseOrderStatus,
  SupplierDto,
  WarehouseDto,
} from '@opstrace/shared-types';
import { CreatePurchaseOrderSchema } from '@opstrace/validation';
import { apiClient, apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-blue-50 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  FULLY_RECEIVED: 'bg-emerald-50 text-emerald-700',
  DISCREPANCY: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

interface LineDraft {
  productId: string;
  orderedQuantity: string;
  unitPrice: string;
}

export default function PurchaseOrdersPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('po:create');

  const [orders, setOrders] = useState<PurchaseOrderDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Builder modal state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [poForm, setPoForm] = useState({
    poNumber: '',
    supplierId: '',
    warehouseId: '',
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '',
    status: PurchaseOrderStatus.ISSUED as 'DRAFT' | 'ISSUED',
  });
  const [lines, setLines] = useState<LineDraft[]>([
    { productId: '', orderedQuantity: '10', unitPrice: '0.00' },
  ]);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [savingPo, setSavingPo] = useState(false);

  // CSV Import modal state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportJobDto | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await apiClient.get<PaginatedResponse<PurchaseOrderDto>>(
        `/purchase-orders?${params.toString()}`,
      );
      setOrders(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load purchase orders.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const openBuilder = async () => {
    setBuilderError(null);
    setBuilderOpen(true);
    try {
      const [supRes, whRes, prodRes] = await Promise.all([
        apiClient.get<PaginatedResponse<SupplierDto>>('/suppliers?limit=100'),
        apiClient.get<PaginatedResponse<WarehouseDto>>('/warehouses?limit=100'),
        apiClient.get<PaginatedResponse<ProductDto>>('/products?limit=100'),
      ]);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
      setProducts(prodRes.data);
      setPoForm({
        poNumber: `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        supplierId: supRes.data[0]?.id ?? '',
        warehouseId: whRes.data[0]?.id ?? '',
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDeliveryDate: '',
        status: PurchaseOrderStatus.ISSUED,
      });
      setLines([
        {
          productId: prodRes.data[0]?.id ?? '',
          orderedQuantity: '10',
          unitPrice: '100.00',
        },
      ]);
    } catch (err) {
      setBuilderError(
        err instanceof ApiError ? err.message : 'Failed to load master data.',
      );
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuilderError(null);

    const payload = {
      supplierId: poForm.supplierId,
      warehouseId: poForm.warehouseId,
      poNumber: poForm.poNumber,
      orderDate: poForm.orderDate,
      expectedDeliveryDate: poForm.expectedDeliveryDate || undefined,
      status: poForm.status,
      items: lines.map((line) => ({
        productId: line.productId,
        orderedQuantity: Number(line.orderedQuantity),
        unitPrice: line.unitPrice,
      })),
    };

    const parsed = CreatePurchaseOrderSchema.safeParse(payload);
    if (!parsed.success) {
      setBuilderError(parsed.error.issues[0]?.message ?? 'Invalid PO inputs.');
      return;
    }

    setSavingPo(true);
    try {
      await apiClient.post('/purchase-orders', parsed.data);
      setBuilderOpen(false);
      await loadOrders();
    } catch (err) {
      setBuilderError(err instanceof ApiError ? err.message : 'Failed to create PO.');
    } finally {
      setSavingPo(false);
    }
  };

  const handleCsvUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      setImportError('Please select a .csv file.');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const job = await apiRequest<ImportJobDto>('/imports/purchase-orders', {
        method: 'POST',
        body: formData,
      });
      setImportResult(job);
      await loadOrders();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'CSV import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track contracted orders, issue shipments, and bulk import via CSV.
          </p>
        </div>

        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCsvFile(null);
                setImportResult(null);
                setImportError(null);
                setCsvOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Bulk CSV Import
            </button>
            <button
              type="button"
              onClick={() => void openBuilder()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              New Purchase Order
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by PO number..."
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        >
          <option value="">All Statuses</option>
          {Object.values(PurchaseOrderStatus).map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {listError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">PO Number</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Order Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading purchase orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {po.supplier?.name ?? po.supplierId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {po.warehouse ? `${po.warehouse.code} — ${po.warehouse.name}` : po.warehouseId}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(po.orderDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          STATUS_BADGE[po.status] ?? 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar meta={meta} onPageChange={setPage} />
      </div>

      {/* Multi-line PO Builder Modal */}
      {builderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                New Purchase Order
              </h2>
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {builderError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{builderError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePo} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={poForm.poNumber}
                    onChange={(e) =>
                      setPoForm({ ...poForm, poNumber: e.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Initial Status
                  </label>
                  <select
                    value={poForm.status}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        status: e.target.value as 'DRAFT' | 'ISSUED',
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value={PurchaseOrderStatus.ISSUED}>ISSUED</option>
                    <option value={PurchaseOrderStatus.DRAFT}>DRAFT</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Supplier
                  </label>
                  <select
                    value={poForm.supplierId}
                    onChange={(e) =>
                      setPoForm({ ...poForm, supplierId: e.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Destination Warehouse
                  </label>
                  <select
                    value={poForm.warehouseId}
                    onChange={(e) =>
                      setPoForm({ ...poForm, warehouseId: e.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Order Date
                  </label>
                  <input
                    type="date"
                    value={poForm.orderDate}
                    onChange={(e) =>
                      setPoForm({ ...poForm, orderDate: e.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={poForm.expectedDeliveryDate}
                    onChange={(e) =>
                      setPoForm({
                        ...poForm,
                        expectedDeliveryDate: e.target.value,
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">
                    Line Items
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLines([
                        ...lines,
                        {
                          productId: products[0]?.id ?? '',
                          orderedQuantity: '1',
                          unitPrice: '0.00',
                        },
                      ])
                    }
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
                    >
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...line, productId: e.target.value };
                          setLines(next);
                        }}
                        className="col-span-6 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={line.orderedQuantity}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = {
                            ...line,
                            orderedQuantity: e.target.value,
                          };
                          setLines(next);
                        }}
                        placeholder="Qty"
                        className="col-span-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                      />
                      <input
                        type="text"
                        value={line.unitPrice}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...line, unitPrice: e.target.value };
                          setLines(next);
                        }}
                        placeholder="Price"
                        className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines(lines.filter((_, i) => i !== idx))
                        }
                        className="col-span-1 flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBuilderOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPo}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingPo ? 'Creating...' : 'Create Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {csvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Bulk CSV Purchase Order Import
              </h2>
              <button
                type="button"
                onClick={() => setCsvOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-600">
              Upload a CSV with columns: <code>po_number</code>,{' '}
              <code>supplier_name</code>, <code>warehouse_code</code>,{' '}
              <code>order_date</code>, <code>expected_delivery_date</code>,{' '}
              <code>sku</code>, <code>ordered_quantity</code>,{' '}
              <code>unit_price</code>.
            </p>

            {importError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <form onSubmit={handleCsvUpload} className="mt-4 space-y-4">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />

              {importResult && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Import Status: {importResult.status}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>Total Rows: {importResult.totalRows}</div>
                    <div className="text-emerald-700">
                      Succeeded: {importResult.successfulRows}
                    </div>
                    <div className="text-red-700">
                      Failed: {importResult.failedRows}
                    </div>
                  </div>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="max-h-40 space-y-1 overflow-y-auto border-t border-slate-200 pt-2 text-xs text-red-700">
                      {importResult.errors.map((rowErr, idx) => (
                        <div key={idx}>
                          Row {rowErr.rowNumber} ({rowErr.poNumber || 'N/A'} /{' '}
                          {rowErr.sku || 'N/A'}): {rowErr.errors.join('; ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCsvOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {importing ? 'Uploading...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
