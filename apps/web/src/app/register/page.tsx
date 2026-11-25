'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { RegisterUserSchema } from '@opstrace/validation';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/AuthContext';

interface RegisterResponse {
  accessToken: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { loginWithToken } = useAuth();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    organizationName: '',
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const parsed = RegisterUserSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post<RegisterResponse>(
        '/auth/register',
        parsed.data,
        { skipAuthRedirect: true },
      );
      await loginWithToken(res.accessToken);
      router.push('/warehouses');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to reach OpsTrace API. Please check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              OpsTrace
            </h1>
            <p className="text-xs text-slate-500">
              Bootstrap your organization workspace
            </p>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-slate-900">Create account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Registers your admin account and initializes default RBAC roles.
        </p>

        {serverError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                First Name
              </label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              {fieldErrors.firstName && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.firstName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Last Name
              </label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              {fieldErrors.lastName && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.lastName}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Organization Name
            </label>
            <input
              type="text"
              value={form.organizationName}
              onChange={(e) => updateField('organizationName', e.target.value)}
              placeholder="Metro Logistics Inc."
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            {fieldErrors.organizationName && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.organizationName}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Work Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="admin@metrologistics.ph"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="Minimum 8 characters"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating workspace...' : 'Create organization'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
