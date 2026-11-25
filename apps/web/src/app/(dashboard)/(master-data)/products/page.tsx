'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Ban, Pencil, Plus, Search, X } from 'lucide-react';
import {
  PaginatedResponse,
  ProductDto,
  ProductStatus,
} from '@opstrace/shared-types';
import {
  CreateProductSchema,
  UpdateProductSchema,
} from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

export default function ProductsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('products:manage');

  const [items, setItems] = useState<ProductDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [form, setForm] = useState({
    sku: '',
    name: '',
    barcode: '',
    unitOfMeasure: 'PIECE',
    description: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await apiClient.get<PaginatedResponse<ProductDto>>(
        `/products?${params.toString()}`,
      );
      setItems(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      sku: '',
      name: '',
      barcode: '',
      unitOfMeasure: 'PIECE',
      description: '',
    });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (prod: ProductDto) => {
    setEditing(prod);
    setForm({
      sku: prod.sku,
      name: prod.name,
      barcode: prod.barcode ?? '',
      unitOfMeasure: prod.unitOfMeasure,
      description: prod.description ?? '',
    });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setModalError(null);

    const payload = {
      sku: form.sku,
      name: form.name,
      unitOfMeasure: form.unitOfMeasure,
      barcode: form.barcode.trim() ? form.barcode.trim() : undefined,
      description: form.description.trim() ? form.description.trim() : undefined,
    };

    const schema = editing ? UpdateProductSchema : CreateProductSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await apiClient.patch(`/products/${editing.id}`, parsed.data);
      } else {
        await apiClient.post('/products', parsed.data);
      }
      setModalOpen(false);
      await loadProducts();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors((prev) => ({
          ...prev,
          sku: err.message || 'A product with this SKU already exists.',
        }));
        setModalError(err.message);
      } else {
        setModalError(
          err instanceof ApiError ? err.message : 'Unable to save product.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscontinue = async (prod: ProductDto) => {
    try {
      await apiClient.delete(`/products/${prod.id}`);
      await loadProducts();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to discontinue product.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Products
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage SKUs, barcodes, and units of measure across your catalog.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Product
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by SKU, name, or barcode..."
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>
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
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    Loading products...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                items.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {prod.sku}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{prod.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {prod.barcode || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{prod.unitOfMeasure}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          prod.status === ProductStatus.ACTIVE
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {prod.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(prod)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit product"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {prod.status === ProductStatus.ACTIVE && (
                            <button
                              type="button"
                              onClick={() => void handleDiscontinue(prod)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              title="Discontinue product"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar meta={meta} onPageChange={setPage} />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit Product' : 'New Product'}
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

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  SKU
                </label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="SKU-1001"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.sku && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.sku}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Product Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Industrial Pallet Wrap"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Barcode
                  </label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="4800123456789"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  {fieldErrors.barcode && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.barcode}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    value={form.unitOfMeasure}
                    onChange={(e) =>
                      setForm({ ...form, unitOfMeasure: e.target.value })
                    }
                    placeholder="PIECE / BOX / ROLL"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  {fieldErrors.unitOfMeasure && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.unitOfMeasure}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Optional specifications"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.description && (
                  <p className="mt-1 text-xs text-red-600">
                    {fieldErrors.description}
                  </p>
                )}
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
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
