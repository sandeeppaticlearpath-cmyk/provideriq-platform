'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuthStore();
  const [form, setForm] = useState({ email: 'admin@provideriq.com', password: 'Admin123!', orgSlug: 'demo-agency' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(form.email, form.password, form.orgSlug || undefined);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to sign in. Check your credentials and API connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-25 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-card-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">ProviderIQ</h1>
            <p className="text-sm text-slate-500">Sign in to your workspace</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field label="Organization slug">
            <input
              value={form.orgSlug}
              onChange={(e) => setForm((current) => ({ ...current, orgSlug: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="demo-agency"
            />
          </Field>
          <Field label="Email address">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="admin@provideriq.com"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="••••••••"
            />
          </Field>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
