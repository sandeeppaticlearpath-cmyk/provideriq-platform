'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, TrendingUp, Users, Phone, Mail, Clock, Star,
  ChevronRight, Filter, Search, MoreHorizontal, Flag,
  ArrowUpRight, Calendar, Activity, CheckCircle2, AlertCircle,
  Zap, Plus, RefreshCw, MessageSquare, Target, BarChart3
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn, formatRelativeTime, formatNumber } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';

const CONTACT_FLAGS = [
  { id: 'hot_lead', label: 'Hot Lead', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', darkBg: '#fee2e2' },
  { id: 'warm_lead', label: 'Warm Lead', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', darkBg: '#ffedd5' },
  { id: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', darkBg: '#d1fae5' },
  { id: 'prospects', label: 'Prospect', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', darkBg: '#dbeafe' },
  { id: 'not_responding', label: 'Not Responding', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', darkBg: '#f1f5f9' },
  { id: 'dormant', label: 'Dormant', color: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400', darkBg: '#f3f4f6' },
  { id: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500', darkBg: '#fef9c3' },
  { id: 'booked', label: 'Booked', color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500', darkBg: '#ede9fe' },
  { id: 'placed', label: 'Placed', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-600', darkBg: '#dcfce7' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', darkBg: '#fef3c7' },
  { id: 'do_not_contact', label: 'DNC', color: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500', darkBg: '#ffe4e6' },
];

export default function BookOfBusinessPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeFlag, setActiveFlag] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const { data: overview } = useQuery({
    queryKey: ['bob', 'overview'],
    queryFn: () => api.get('/book-of-business/overview').then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: followups = [] } = useQuery({
    queryKey: ['bob', 'followups'],
    queryFn: () => api.get('/book-of-business/followups').then(r => r.data),
  });

  const { data: candidatesData } = useQuery({
    queryKey: ['bob', 'candidates', activeFlag, searchQ],
    queryFn: () => api.get('/book-of-business/candidates', {
      params: { flag: activeFlag || undefined, q: searchQ || undefined, limit: 60 }
    }).then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['bob', 'stats'],
    queryFn: () => api.get('/book-of-business/stats').then(r => r.data),
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, flag, notes }) => api.patch(`/book-of-business/candidates/${id}/flag`, { flag, notes }),
    onSuccess: () => {
      toast.success('Flag updated');
      queryClient.invalidateQueries({ queryKey: ['bob'] });
    },
    onError: () => toast.error('Failed to update flag'),
  });

  const summary = overview?.summary || {};
  const candidates = candidatesData?.candidates || [];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-brand-500" />
            My Book of Business
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {user?.firstName}'s personal pipeline · {formatNumber(summary.total_candidates)} candidates
          </p>
        </div>
        <Link
          href="/candidates/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Candidate
        </Link>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <BoBStat label="Total" value={summary.total_candidates} icon={Users} color="slate" />
        <BoBStat label="Placements" value={summary.placements} icon={CheckCircle2} color="emerald" />
        <BoBStat label="Near Close" value={summary.near_close} icon={Target} color="amber" />
        <BoBStat label="Contacted This Week" value={summary.contacted_this_week} icon={Activity} color="brand" />
        <BoBStat label="Need Follow-up" value={summary.needs_followup} icon={AlertCircle} color="rose" highlight />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Flag Stats + Follow-ups */}
        <div className="space-y-4">
          {/* Flag Distribution */}
          <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Flag className="w-4 h-4 text-slate-400" /> By Status Flag
            </h3>
            <div className="space-y-2">
              {CONTACT_FLAGS.map(flag => {
                const count = stats?.[flag.id] || stats?.[`${flag.id}_flag`] || 0;
                if (!count && flag.id !== 'active') return null;
                return (
                  <button
                    key={flag.id}
                    onClick={() => setActiveFlag(activeFlag === flag.id ? '' : flag.id)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-left',
                      activeFlag === flag.id ? flag.color + ' border' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', flag.dot)} />
                      <span className="text-xs font-medium text-slate-700">{flag.label}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-600">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Follow-up Reminders */}
          {followups.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Needs Follow-up ({followups.length})
              </h3>
              <div className="space-y-2">
                {followups.slice(0, 6).map(c => (
                  <div key={c.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-900">Dr. {c.first_name} {c.last_name}</p>
                      <p className="text-[11px] text-amber-700">{c.specialty} · {Math.round(c.days_since_contact)}d ago</p>
                    </div>
                    <Link
                      href={`/candidates/${c.id}`}
                      className="text-[11px] text-amber-700 hover:text-amber-900 font-medium"
                    >
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Candidate List */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
          {/* List Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search your candidates..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300 placeholder:text-slate-400"
              />
            </div>
            {activeFlag && (
              <button
                onClick={() => setActiveFlag('')}
                className="flex items-center gap-1.5 px-3 py-2 bg-brand-100 text-brand-700 text-xs font-medium rounded-xl hover:bg-brand-200 transition-colors"
              >
                {CONTACT_FLAGS.find(f => f.id === activeFlag)?.label}
                <span>✕</span>
              </button>
            )}
          </div>

          {/* Candidate Rows */}
          <div className="divide-y divide-slate-50 overflow-y-auto" style={{ maxHeight: 600 }}>
            {candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="w-8 h-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">
                  {activeFlag ? `No candidates flagged as "${CONTACT_FLAGS.find(f => f.id === activeFlag)?.label}"` : 'No candidates yet'}
                </p>
              </div>
            ) : (
              candidates.map(candidate => (
                <BoBCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isSelected={selectedCandidate?.id === candidate.id}
                  onSelect={() => setSelectedCandidate(p => p?.id === candidate.id ? null : candidate)}
                  onFlag={(flag) => flagMutation.mutate({ id: candidate.id, flag })}
                  isUpdating={flagMutation.isPending && flagMutation.variables?.id === candidate.id}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoBCandidateRow({ candidate, isSelected, onSelect, onFlag, isUpdating }) {
  const [showFlagMenu, setShowFlagMenu] = useState(false);
  const flag = CONTACT_FLAGS.find(f => f.id === candidate.contact_flag);

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-all',
        isSelected && 'bg-brand-50'
      )}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">
          {candidate.first_name?.[0]}{candidate.last_name?.[0]}
        </span>
      </div>

      {/* Name + Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900 truncate">
            Dr. {candidate.first_name} {candidate.last_name}
          </p>
          {flag && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0', flag.color)}>
              {flag.label}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 truncate">
          {candidate.specialty} · {candidate.pipeline_stage} · {candidate.last_contacted_at ? formatRelativeTime(candidate.last_contacted_at) : 'Never contacted'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {candidate.phone && (
          <a
            href={`tel:${candidate.phone}`}
            onClick={e => e.stopPropagation()}
            className="p-1.5 hover:bg-emerald-100 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors"
            title="Call"
          >
            <Phone className="w-3.5 h-3.5" />
          </a>
        )}
        {candidate.email && (
          <a
            href={`mailto:${candidate.email}`}
            onClick={e => e.stopPropagation()}
            className="p-1.5 hover:bg-blue-100 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
            title="Email"
          >
            <Mail className="w-3.5 h-3.5" />
          </a>
        )}

        {/* Flag button */}
        <div className="relative">
          <button
            onClick={e => { e.stopPropagation(); setShowFlagMenu(!showFlagMenu); }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            title="Set flag"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>

          <AnimatePresence>
            {showFlagMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowFlagMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-card-lg p-2 w-48"
                >
                  {CONTACT_FLAGS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => { onFlag(f.id); setShowFlagMenu(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-left transition-colors',
                        candidate.contact_flag === f.id ? f.color : 'hover:bg-slate-50 text-slate-600'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', f.dot)} />
                      {f.label}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <Link
          href={`/candidates/${candidate.id}`}
          onClick={e => e.stopPropagation()}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function BoBStat({ label, value, icon: Icon, color, highlight }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    brand: 'bg-brand-100 text-brand-700',
    rose: 'bg-rose-100 text-rose-700',
  };

  return (
    <div className={cn('bg-white rounded-2xl border shadow-card p-4', highlight ? 'border-rose-200' : 'border-slate-100')}>
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2', colors[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{formatNumber(value || 0)}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
