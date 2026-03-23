'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, MapPin, Phone, Mail, Stethoscope } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';

const STAGES = [
  { id: 'sourced', label: 'Sourced', color: 'bg-indigo-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-violet-500' },
  { id: 'interested', label: 'Interested', color: 'bg-pink-500' },
  { id: 'submitted', label: 'Submitted', color: 'bg-amber-500' },
  { id: 'interview', label: 'Interview', color: 'bg-blue-500' },
  { id: 'offer', label: 'Offer', color: 'bg-emerald-500' },
  { id: 'placed', label: 'Placed', color: 'bg-green-600' },
];

export default function CandidatesPage() {
  const [searchQ, setSearchQ] = useState('');
  const { data: pipeline = [], isLoading } = useQuery({
    queryKey: ['candidates', 'pipeline'],
    queryFn: () => api.get('/candidates/pipeline').then((response) => response.data),
    refetchInterval: 30000,
  });

  const filteredColumns = useMemo(() => {
    const query = searchQ.trim().toLowerCase();
    if (!query) return pipeline;

    return pipeline.map((column) => ({
      ...column,
      candidates: column.candidates.filter((candidate) =>
        `${candidate.firstName} ${candidate.lastName} ${candidate.specialty || ''}`.toLowerCase().includes(query)
      ),
    }));
  }, [pipeline, searchQ]);

  const totalCandidates = pipeline.reduce((sum, column) => sum + column.count, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Candidate pipeline</h1>
          <p className="mt-0.5 text-sm text-slate-400">{totalCandidates} candidates across all stages</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQ}
              onChange={(event) => setSearchQ(event.target.value)}
              placeholder="Filter candidates..."
              className="w-64 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <Link
            href="/candidates/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            Add Candidate
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex h-full gap-3" style={{ minWidth: `${STAGES.length * 280}px` }}>
          {STAGES.map((stage) => {
            const column = filteredColumns.find((item) => item.stage === stage.id) || { candidates: [], count: 0 };
            return (
              <section key={stage.id} className="flex w-[272px] flex-shrink-0 flex-col rounded-2xl bg-slate-50">
                <header className="flex items-center justify-between px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full', stage.color)} />
                    <h2 className="text-sm font-semibold text-slate-700">{stage.label}</h2>
                    <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-500">
                      {column.count}
                    </span>
                  </div>
                </header>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
                    ))
                  ) : column.candidates.length ? (
                    column.candidates.map((candidate) => (
                      <CandidateCard key={candidate.id} candidate={candidate} />
                    ))
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-xs text-slate-400">
                      No candidates in this stage
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CandidateCard({ candidate }) {
  return (
    <Link
      href={`/candidates/${candidate.id}`}
      className="block rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:border-slate-200 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Dr. {candidate.firstName} {candidate.lastName}</p>
          <p className="mt-0.5 text-xs text-slate-400">Updated {formatRelativeTime(candidate.updatedAt)}</p>
        </div>
      </div>

      {candidate.specialty ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <Stethoscope className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{candidate.specialty}</span>
        </div>
      ) : null}
      {candidate.state ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{candidate.state}</span>
        </div>
      ) : null}
      {candidate.phone ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{candidate.phone}</span>
        </div>
      ) : null}
      {candidate.email ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{candidate.email}</span>
        </div>
      ) : null}
    </Link>
  );
}
