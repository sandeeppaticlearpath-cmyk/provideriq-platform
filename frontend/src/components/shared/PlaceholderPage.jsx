import Link from 'next/link';

export default function PlaceholderPage({
  title,
  description,
  primaryHref = '/dashboard',
  primaryLabel = 'Back to dashboard',
}) {
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-card">
        <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          Workspace page
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/providers"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Browse providers
          </Link>
        </div>
      </div>
    </div>
  );
}
