'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function CandidateDetailPage() {
  const params = useParams();
  const candidateId = params?.id;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['candidate', candidateId],
    enabled: !!candidateId,
    queryFn: () => api.get(`/candidates/${candidateId}`).then((response) => response.data),
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading candidate…</div>;
  }

  if (isError || !data) {
    return <div className="p-6 text-sm text-rose-600">Unable to load this candidate.</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {data.first_name || data.firstName} {data.last_name || data.lastName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.specialty || 'No specialty set'} · {data.pipeline_stage || data.pipelineStage || 'sourced'}
          </p>
        </div>
        <Link href="/candidates" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to pipeline
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <InfoCard title="Contact details" items={[
          ['Email', data.email || '—'],
          ['Phone', data.phone || '—'],
          ['State', data.state || '—'],
          ['City', data.city || '—'],
        ]} />
        <InfoCard title="Profile" items={[
          ['Credential', data.credential || '—'],
          ['Source', data.source || '—'],
          ['Last contacted', formatDate(data.last_contacted_at || data.lastContactedAt) || '—'],
          ['Created', formatDate(data.created_at || data.createdAt) || '—'],
        ]} />
      </section>
    </div>
  );
}

function InfoCard({ title, items }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
