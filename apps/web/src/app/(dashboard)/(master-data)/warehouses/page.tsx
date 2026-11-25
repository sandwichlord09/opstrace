'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  PaginatedResponse,
  WarehouseDto,
  WarehouseStatus,
} from '@opstrace/shared-types';
import {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
} from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

export default function WarehousesPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('warehouses:manage');

  const [items, setItems] = useState<WarehouseDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseDto | null>(null);
  const [form, setForm] = useState({ name: '', code: '', address: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadWarehouses = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await apiClient.get<PaginatedResponse<WarehouseDto>>(
        `/warehouses?${params.toString()}`,
      );
      setItems(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load warehouses.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', address: '' });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (wh: WarehouseDto) => {
    setEditing(wh);
    setForm({
      name: wh.name,
      code: wh.code,
      address: wh.address ?? '',
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
      name: form.name,
      code: form.code,
      address: form.address.trim() ? form.address.trim() : undefined,
    };

    const schema = editing ? UpdateWarehouseSchema : CreateWarehouseSchema;
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
        await apiClient.patch(`/warehouses/${editing.id}`, parsed.data);
      } else {
        await apiClient.post('/warehouses', parsed.data);
      }
      setModalOpen(false);
      await loadWarehouses();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Unable to save warehouse.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (wh: WarehouseDto) => {
    try {
      await apiClient.delete(`/warehouses/${wh.id}`);
      await loadWarehouses();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to deactivate warehouse.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Warehouses
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage distribution centers and receiving locations.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Warehouse
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
            placeholder="Search by name or code..."
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
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    Loading warehouses...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    No warehouses found.
                  </td>
                </tr>
              ) : (
                items.map((wh) => (
                  <tr key={wh.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                      {wh.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{wh.name}</td>
                    <td className="px-4 py-3 text-slate-600">{wh.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          wh.status === WarehouseStatus.ACTIVE
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {wh.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(wh)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit warehouse"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {wh.status === WarehouseStatus.ACTIVE && (
                            <button
                              type="button"
                              onClick={() => void handleDeactivate(wh)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              title="Deactivate warehouse"
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
                {editing ? 'Edit Warehouse' : 'New Warehouse'}
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
                  Warehouse Code
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="WH-MNL-01"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.code && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.code}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Warehouse Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Manila North Hub"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Address
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Optional street address"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.address && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.address}</p>
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
