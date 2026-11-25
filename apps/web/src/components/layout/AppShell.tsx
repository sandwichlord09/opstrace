'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  ClipboardCheck,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Purchase Orders', href: '/purchase-orders', icon: FileText, badge: 'Soon' },
  { label: 'Goods Receipts', href: '/goods-receipts', icon: PackageCheck, badge: 'Soon' },
  { label: 'Exceptions', href: '/exceptions', icon: AlertTriangle, badge: 'Soon' },
  { label: 'Stock Inspections', href: '/stock-inspections', icon: ClipboardCheck, badge: 'Soon' },
  { label: 'Audit Logs', href: '/audit-logs', icon: History, badge: 'Soon' },
];

const MASTER_DATA_NAV: NavItem[] = [
  { label: 'Warehouses', href: '/warehouses', icon: Warehouse },
  { label: 'Products', href: '/products', icon: Package },
  { label: 'Suppliers', href: '/suppliers', icon: Truck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm font-medium text-slate-500">
          Loading OpsTrace workspace...
        </div>
      </div>
    );
  }

  const renderNavLink = (item: NavItem) => {
    const active =
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;

    if (item.badge) {
      return (
        <span
          key={item.href}
          className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-500"
        >
          <span className="flex items-center gap-3">
            <Icon className="h-4 w-4" />
            {item.label}
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {item.badge}
          </span>
        </span>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? 'bg-slate-800 text-white'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
        }`}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white">
              OpsTrace
            </span>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Operations Control
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div className="space-y-1">{PRIMARY_NAV.map(renderNavLink)}</div>

        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Master Data
          </p>
          <div className="space-y-1">{MASTER_DATA_NAV.map(renderNavLink)}</div>
        </div>
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="text-xs text-slate-400">Signed in as</div>
        <div className="truncate text-sm font-medium text-white">
          {user.firstName} {user.lastName}
        </div>
        <div className="truncate text-xs text-slate-400">{user.email}</div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64">{sidebarContent}</aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="font-semibold text-slate-900">
                {user.organizationName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
              {user.role}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
