'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Ban, Pencil, Plus, Search, X } from 'lucide-react';
import {
  PaginatedResponse,
  SupplierDto,
  SupplierStatus,
} from '@opstrace/shared-types';
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
} from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';
import { PaginationBar } from '@/components/ui/PaginationBar';

export default function SuppliersPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('suppliers:manage');

  const [items, setItems] = useState<SupplierDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await apiClient.get<PaginatedResponse<SupplierDto>>(
        `/suppliers?${params.toString()}`,
      );
      setItems(res.data);
      setMeta(res.meta);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', phone: '', address: '' });
    setFieldErrors({});
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (sup: SupplierDto) => {
    setEditing(sup);
    setForm({
      name: sup.name,
      email: sup.email ?? '',
      phone: sup.phone ?? '',
      address: sup.address ?? '',
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
      email: form.email.trim() ? form.email.trim() : undefined,
      phone: form.phone.trim() ? form.phone.trim() : undefined,
      address: form.address.trim() ? form.address.trim() : undefined,
    };

    const schema = editing ? UpdateSupplierSchema : CreateSupplierSchema;
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
        await apiClient.patch(`/suppliers/${editing.id}`, parsed.data);
      } else {
        await apiClient.post('/suppliers', parsed.data);
      }
      setModalOpen(false);
      await loadSuppliers();
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Unable to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (sup: SupplierDto) => {
    try {
      await apiClient.delete(`/suppliers/${sup.id}`);
      await loadSuppliers();
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Failed to deactivate supplier.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Suppliers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage vendor accounts and procurement contacts.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
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
            placeholder="Search by supplier name..."
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
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    Loading suppliers...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    No suppliers found.
                  </td>
                </tr>
              ) : (
                items.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{sup.name}</td>
                    <td className="px-4 py-3 text-slate-600">{sup.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{sup.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{sup.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          sup.status === SupplierStatus.ACTIVE
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sup.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(sup)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Edit supplier"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {sup.status === SupplierStatus.ACTIVE && (
                            <button
                              type="button"
                              onClick={() => void handleDeactivate(sup)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              title="Deactivate supplier"
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
                {editing ? 'Edit Supplier' : 'New Supplier'}
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
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Metro Supply Co."
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="orders@metrosupply.ph"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Phone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+63 2 8123 4567"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                {fieldErrors.phone && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>
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
                  placeholder="Optional business address"
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
