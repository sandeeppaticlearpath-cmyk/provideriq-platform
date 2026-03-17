'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, Briefcase, TrendingUp, Clock, ArrowUpRight, ArrowDownRight,
  BarChart3, Activity, CheckCircle2, Circle, Zap, Plus
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn, formatNumber, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const PIPELINE_COLORS = {
  sourced: '#6366f1', contacted: '#8b5cf6', interested: '#ec4899',
  submitted: '#f59e0b', interview: '#3b82f6', offer: '#10b981', placed: '#059669',
};

const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } } },
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => api.get('/analytics/dashboard?period=30d').then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: trendData } = useQuery({
    queryKey: ['analytics', 'trend'],
    queryFn: () => api.get('/analytics/submissions-trend?period=30d').then(r => r.data),
  });

  if (isLoading) return <DashboardSkeleton />;

  const summary = data?.summary || {};
  const pipeline = data?.pipeline || [];
  const recruiters = data?.recruiterPerformance || [];
  const recentActivity = data?.recentActivity || [];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Good morning, {user?.firstName} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Here's what's happening with your staffing pipeline today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/providers"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 
              text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Zap className="w-4 h-4" />
            Source Providers
          </Link>
          <Link
            href="/candidates/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white 
              text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Candidate
          </Link>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        variants={stagger.container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <KPICard
          label="Total Candidates"
          value={formatNumber(summary.totalCandidates)}
          icon={Users}
          color="brand"
          change="+12%"
          positive
        />
        <KPICard
          label="Submissions (30d)"
          value={formatNumber(summary.submissions)}
          icon={Briefcase}
          color="violet"
          change="+8%"
          positive
        />
        <KPICard
          label="Placements (30d)"
          value={formatNumber(summary.placements)}
          icon={CheckCircle2}
          color="emerald"
          change="+23%"
          positive
        />
        <KPICard
          label="Avg Days to Fill"
          value={summary.avgDaysToFill || '—'}
          icon={Clock}
          color="amber"
          suffix=" days"
          change="-3d"
          positive
        />
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Submissions & Placements</h3>
              <p className="text-sm text-slate-400 mt-0.5">Last 30 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 bg-brand-500 rounded-full inline-block" />
                Submissions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 bg-emerald-500 rounded-full inline-block" />
                Placements
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData || generateMockTrend()} margin={{ left: -20 }}>
              <defs>
                <linearGradient id="submissions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5570f4" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#5570f4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="placements" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                tickFormatter={v => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
                labelStyle={{ fontSize: 12, color: '#475569', marginBottom: 4 }}
                itemStyle={{ fontSize: 12, color: '#64748b' }}
              />
              <Area type="monotone" dataKey="submissions" stroke="#5570f4" strokeWidth={2} fill="url(#submissions)" dot={false} />
              <Area type="monotone" dataKey="placements" stroke="#10b981" strokeWidth={2} fill="url(#placements)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Pipeline Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-card border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Pipeline</h3>
              <p className="text-sm text-slate-400 mt-0.5">Conversion funnel</p>
            </div>
            <Link href="/candidates?view=pipeline" className="text-xs text-brand-600 font-medium hover:underline">
              View kanban →
            </Link>
          </div>
          <div className="space-y-2.5">
            {pipeline.map((stage, i) => (
              <div key={stage.stage} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600 capitalize">{stage.stage}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{stage.rate}%</span>
                    <span className="text-xs font-semibold text-slate-800 tabular-nums">{stage.count}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stage.rate}%` }}
                    transition={{ delay: 0.4 + i * 0.05, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: PIPELINE_COLORS[stage.stage] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recruiter Performance */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="lg:col-span-2 bg-white rounded-2xl shadow-card border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900">Recruiter Performance</h3>
            <span className="text-xs text-slate-400">Last 30 days</span>
          </div>
          <div className="space-y-3">
            {(recruiters.slice(0, 5).length ? recruiters.slice(0, 5) : generateMockRecruiters()).map((r, i) => (
              <div key={r.id || i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs font-semibold">
                    {r.first_name?.[0]}{r.last_name?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.first_name} {r.last_name}</p>
                  <p className="text-xs text-slate-400">{r.candidates_owned} candidates</p>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.submissions}</p>
                    <p className="text-xs text-slate-400">Submitted</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-600">{r.placements}</p>
                    <p className="text-xs text-slate-400">Placed</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl shadow-card border border-slate-100 p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900">Activity</h3>
            <Link href="/activity" className="text-xs text-brand-600 font-medium hover:underline">View all</Link>
          </div>
          <div className="space-y-4">
            {(recentActivity.slice(0, 6).length ? recentActivity.slice(0, 6) : generateMockActivity()).map((a, i) => (
              <div key={a.id || i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-slate-500 text-[10px] font-bold">
                    {a.first_name?.[0]}{a.last_name?.[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-medium">{a.first_name} {a.last_name}</span>{' '}
                    {a.description || a.action?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatDate(a.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color, change, positive, suffix = '' }) {
  const colors = {
    brand: { bg: 'bg-brand-50', icon: 'text-brand-600', iconBg: 'bg-brand-100' },
    violet: { bg: 'bg-violet-50', icon: 'text-violet-600', iconBg: 'bg-violet-100' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', iconBg: 'bg-amber-100' },
  };

  const c = colors[color];

  return (
    <motion.div
      variants={stagger.item}
      className="bg-white rounded-2xl shadow-card border border-slate-100 p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', c.iconBg)}>
          <Icon className={cn('w-5 h-5', c.icon)} />
        </div>
        {change && (
          <div className={cn(
            'flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-lg',
            positive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'
          )}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight">
        {value}{suffix}
      </p>
      <p className="text-sm text-slate-400 mt-1">{label}</p>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 animate-pulse">
      <div className="h-8 bg-slate-100 rounded-xl w-64 mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 h-80 bg-slate-100 rounded-2xl" />
        <div className="h-80 bg-slate-100 rounded-2xl" />
      </div>
    </div>
  );
}

function generateMockTrend() {
  return [...Array(30)].map((_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
    submissions: Math.floor(Math.random() * 15 + 5),
    placements: Math.floor(Math.random() * 4),
  }));
}

function generateMockRecruiters() {
  return [
    { first_name: 'Sarah', last_name: 'Johnson', candidates_owned: 45, submissions: 23, placements: 8 },
    { first_name: 'Michael', last_name: 'Chen', candidates_owned: 38, submissions: 19, placements: 6 },
    { first_name: 'Amanda', last_name: 'Torres', candidates_owned: 31, submissions: 15, placements: 5 },
    { first_name: 'James', last_name: 'Williams', candidates_owned: 28, submissions: 12, placements: 4 },
  ];
}

function generateMockActivity() {
  const activities = [
    { first_name: 'Sarah', last_name: 'J', description: 'moved Dr. Roberts to Interview stage', created_at: new Date(Date.now() - 5 * 60000) },
    { first_name: 'Michael', last_name: 'C', description: 'submitted Dr. Kim for Cardiology role', created_at: new Date(Date.now() - 22 * 60000) },
    { first_name: 'Amanda', last_name: 'T', description: 'added note on Dr. Patel - interested', created_at: new Date(Date.now() - 45 * 60000) },
    { first_name: 'James', last_name: 'W', description: 'sourced 3 new Hospitalist providers', created_at: new Date(Date.now() - 90 * 60000) },
    { first_name: 'Sarah', last_name: 'J', description: 'placed Dr. Garcia at Memorial Hospital', created_at: new Date(Date.now() - 3 * 3600000) },
  ];
  return activities;
}
