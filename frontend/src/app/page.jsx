import Link from 'next/link';
import { ArrowRight, Database, LayoutDashboard, Sparkles, Workflow, ShieldCheck, Activity } from 'lucide-react';

const features = [
  {
    title: 'Provider sourcing',
    description: 'Search the provider database, filter by specialty and state, and move candidates into the pipeline quickly.',
    icon: Database,
  },
  {
    title: 'Recruiting workflow',
    description: 'Track candidates across sourcing, outreach, submissions, interviews, offers, and placements.',
    icon: Workflow,
  },
  {
    title: 'Dashboard analytics',
    description: 'Monitor recruiter performance, pipeline movement, submissions, placements, and recent activity.',
    icon: LayoutDashboard,
  },
  {
    title: 'AI assistance',
    description: 'Enable OpenAI-powered recruiting helpers when `OPENAI_API_KEY` is configured for your environment.',
    icon: Sparkles,
  },
];

const setupSteps = [
  'Copy `.env.example` to `.env` and fill in your local database, Redis, JWT, and OpenAI values.',
  'Start PostgreSQL and Redis, then run the backend with `cd backend && npm install && npm run dev`.',
  'Install frontend dependencies and run `cd frontend && npm install && npm run dev`.',
  'Open `/auth/login` with the seeded demo credentials once the API and database are ready.',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-25 text-slate-900">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
              ProviderIQ platform
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Healthcare staffing intelligence, ready to publish and share.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              This repository bundles the Next.js frontend, Express API, PostgreSQL schema, and worker layer for a recruiting-focused healthcare staffing platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Open app login
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Go to dashboard
              </Link>
            </div>
          </div>

          <div className="grid w-full max-w-xl gap-4 sm:grid-cols-2">
            <StatCard label="Frontend" value="Next.js 14" help="App Router workspace" />
            <StatCard label="Backend" value="Express API" help="JWT + REST + Socket.IO" />
            <StatCard label="Data" value="PostgreSQL" help="Schema + org isolation" />
            <StatCard label="Workers" value="Bull + Redis" help="Enrichment queue" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What is included</h2>
            <p className="text-sm text-slate-500">A clean landing page for the repo plus the core application surfaces.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.2fr,0.8fr] lg:px-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Quick setup</h2>
            <ol className="mt-6 space-y-4">
              {setupSteps.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-25 p-4">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-600">{step}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-card-md">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-200">
              <ShieldCheck className="h-4 w-4" />
              Recommended local environment
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p>• Node.js 20+</p>
              <p>• PostgreSQL 16</p>
              <p>• Redis 7</p>
              <p>• Docker / Docker Compose for one-command local orchestration</p>
              <p>• Optional OpenAI API key for AI recruiter workflows</p>
            </div>
            <div className="mt-6 rounded-2xl bg-white/5 p-4 text-xs leading-6 text-slate-300">
              Tip: keep this landing page as the default route when you publish the repo so reviewers can understand the project before signing in.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value, help }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{help}</p>
    </div>
  );
}
