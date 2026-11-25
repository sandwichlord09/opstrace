'use client';

import Link from 'next/link';
import { Package, Truck, Warehouse } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function OverviewPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Operations Overview
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome back, {user?.firstName}. Manage your organization&apos;s
          warehouses, products, and suppliers below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/warehouses"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <Warehouse className="h-6 w-6 text-indigo-600" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Warehouses
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure distribution hubs, codes, and active facility status.
          </p>
        </Link>

        <Link
          href="/products"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <Package className="h-6 w-6 text-indigo-600" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Products
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Maintain SKU catalog, barcodes, and units of measure.
          </p>
        </Link>

        <Link
          href="/suppliers"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <Truck className="h-6 w-6 text-indigo-600" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Suppliers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage vendor directory and contact details.
          </p>
        </Link>
      </div>
    </div>
  );
}
