'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, MessageSquare, Video, Clock, CheckCircle2, XCircle,
  Plus, Filter, Search, ChevronDown, AlertCircle, Mic, Pause,
  Play, Send, Star, MoreHorizontal, Flag, Calendar, User,
  PhoneCall, PhoneMissed, PhoneIncoming, PhoneOff,
  ExternalLink, RefreshCw, Zap, Building2
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatRelativeTime, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const CONTACT_FLAGS = [
  { id: 'hot_lead', label: 'Hot Lead', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
  { id: 'warm_lead', label: 'Warm Lead', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { id: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'prospects', label: 'Prospect', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { id: 'not_responding', label: 'Not Responding', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  { id: 'dormant', label: 'Dormant', color: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400' },
  { id: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  { id: 'booked', label: 'Booked', color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  { id: 'placed', label: 'Placed', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-600' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { id: 'do_not_contact', label: 'Do Not Contact', color: 'bg-rose-100 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
];

const CHANNEL_ICONS = {
  email: Mail,
  call: Phone,
  sms: MessageSquare,
  teams: Video,
};

const CHANNEL_COLORS = {
  email: 'text-blue-500 bg-blue-50',
  call: 'text-emerald-500 bg-emerald-50',
  sms: 'text-violet-500 bg-violet-50',
  teams: 'text-indigo-500 bg-indigo-50',
};

export default function CommunicationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedComm, setSelectedComm] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ channel: 'call', direction: 'outbound', body: '', summary: '', notes: '', callFlag: '', duration: '' });

  const { data: dashboard } = useQuery({
    queryKey: ['comms', 'dashboard'],
    queryFn: () => api.get('/communications/dashboard?period=7d').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: comms = [] } = useQuery({
    queryKey: ['comms', 'recent', activeTab],
    queryFn: () => api.get(`/communications/dashboard?period=30d${activeTab !== 'all' ? `&channel=${activeTab}` : ''}`).then(r => r.data?.recentCommunications || []),
  });

  const logMutation = useMutation({
    mutationFn: (data) => api.post('/communications/log', data),
    onSuccess: () => {
      toast.success('Activity logged');
      setShowLogModal(false);
      setLogForm({ channel: 'call', direction: 'outbound', body: '', summary: '', notes: '', callFlag: '', duration: '' });
      queryClient.invalidateQueries({ queryKey: ['comms'] });
    },
    onError: () => toast.error('Failed to log activity'),
  });

  const updateCommMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/communications/${id}`, data),
    onSuccess: () => {
      toast.success('Updated');
      queryClient.invalidateQueries({ queryKey: ['comms'] });
    },
  });

  const stats = dashboard?.stats || {};

  return (
    <div className="flex h-full">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-5 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Communications Hub</h1>
              <p className="text-sm text-slate-400 mt-0.5">Calls, emails, SMS — all tracked in one place</p>
            </div>
            <button
              onClick={() => setShowLogModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Log Activity
            </button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Calls" value={stats.calls || 0} icon={Phone} color="emerald" />
            <StatCard label="Emails" value={stats.emails || 0} icon={Mail} color="blue" />
            <StatCard label="SMS" value={stats.sms || 0} icon={MessageSquare} color="violet" />
            <StatCard label="Replies" value={stats.replies || 0} icon={CheckCircle2} color="amber" />
          </div>

          {/* Tab Filter */}
          <div className="flex gap-1 mt-4 bg-slate-100 p-1 rounded-xl w-fit">
            {['all', 'call', 'email', 'sms', 'teams'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                  activeTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab === 'all' ? 'All' : tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Communications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {comms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Phone className="w-8 h-8 text-slate-200 mb-3" />
              <p className="text-sm text-slate-500">No communications yet</p>
              <p className="text-xs text-slate-400 mt-1">Log your first call or email above</p>
            </div>
          ) : (
            comms.map((comm, i) => (
              <CommunicationRow
                key={comm.id}
                comm={comm}
                isSelected={selectedComm?.id === comm.id}
                onSelect={() => setSelectedComm(prev => prev?.id === comm.id ? null : comm)}
                onUpdate={(updates) => updateCommMutation.mutate({ id: comm.id, ...updates })}
              />
            ))
          )}
        </div>
      </div>

      {/* Side Panel - Detail */}
      <AnimatePresence>
        {selectedComm && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-slate-100 bg-white overflow-hidden flex-shrink-0"
          >
            <CommDetailPanel
              comm={selectedComm}
              onClose={() => setSelectedComm(null)}
              onUpdate={(updates) => updateCommMutation.mutate({ id: selectedComm.id, ...updates })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log Activity Modal */}
      <AnimatePresence>
        {showLogModal && (
          <LogActivityModal
            form={logForm}
            setForm={setLogForm}
            onSubmit={() => logMutation.mutate(logForm)}
            onClose={() => setShowLogModal(false)}
            isSubmitting={logMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CommunicationRow({ comm, isSelected, onSelect, onUpdate }) {
  const Icon = CHANNEL_ICONS[comm.channel] || Phone;
  const flag = CONTACT_FLAGS.find(f => f.id === comm.metadata?.callFlag);

  return (
    <motion.div
      onClick={onSelect}
      className={cn(
        'flex items-start gap-4 px-6 py-4 cursor-pointer transition-all hover:bg-slate-50',
        isSelected && 'bg-brand-50'
      )}
    >
      {/* Channel icon */}
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', CHANNEL_COLORS[comm.channel])}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {comm.cand_first
              ? `Dr. ${comm.cand_first} ${comm.cand_last}`
              : comm.subject || `${comm.channel} ${comm.direction}`}
          </p>
          {flag && (
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0', flag.color)}>
              {flag.label}
            </span>
          )}
        </div>

        {comm.subject && comm.cand_first && (
          <p className="text-xs text-slate-500 truncate mb-0.5">{comm.subject}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="capitalize">{comm.direction}</span>
          {comm.duration_sec && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.floor(comm.duration_sec / 60)}:{String(comm.duration_sec % 60).padStart(2, '0')}
            </span>
          )}
          <span>{formatRelativeTime(comm.created_at)}</span>
          <span>by {comm.user_first} {comm.user_last}</span>
        </div>

        {/* Summary preview */}
        {comm.metadata?.summary && (
          <p className="text-xs text-slate-500 mt-1 truncate italic">
            "{comm.metadata.summary}"
          </p>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <StatusBadge status={comm.status} />
      </div>
    </motion.div>
  );
}

function CommDetailPanel({ comm, onClose, onUpdate }) {
  const [editNotes, setEditNotes] = useState(comm.metadata?.notes || '');
  const [editSummary, setEditSummary] = useState(comm.metadata?.summary || '');
  const [editFlag, setEditFlag] = useState(comm.metadata?.callFlag || '');
  const [saving, setSaving] = useState(false);
  const Icon = CHANNEL_ICONS[comm.channel] || Phone;

  const save = async () => {
    setSaving(true);
    await onUpdate({ summary: editSummary, notes: editNotes, callFlag: editFlag });
    setSaving(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', CHANNEL_COLORS[comm.channel])}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 capitalize">{comm.channel} · {comm.direction}</p>
            <p className="text-xs text-slate-400">{formatDate(comm.created_at)}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Provider */}
        {comm.cand_first && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">{comm.cand_first[0]}{comm.cand_last?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Dr. {comm.cand_first} {comm.cand_last}</p>
              <p className="text-xs text-slate-400">Provider</p>
            </div>
          </div>
        )}

        {/* Subject / Body */}
        {comm.subject && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Subject</p>
            <p className="text-sm text-slate-800">{comm.subject}</p>
          </div>
        )}
        {comm.body && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Message</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{comm.body}</p>
          </div>
        )}

        {/* Duration */}
        {comm.duration_sec && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="w-4 h-4 text-slate-400" />
            Duration: {Math.floor(comm.duration_sec / 60)}m {comm.duration_sec % 60}s
          </div>
        )}

        {/* Recording */}
        {comm.recording_url && (
          <a href={comm.recording_url} target="_blank" className="flex items-center gap-2 text-sm text-brand-600 hover:underline">
            <Play className="w-4 h-4" /> Play Recording
          </a>
        )}

        {/* Flag */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Status Flag</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CONTACT_FLAGS.map(flag => (
              <button
                key={flag.id}
                onClick={() => setEditFlag(flag.id === editFlag ? '' : flag.id)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all text-left',
                  editFlag === flag.id ? flag.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', flag.dot)} />
                {flag.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Call Summary</p>
          <textarea
            value={editSummary}
            onChange={e => setEditSummary(e.target.value)}
            placeholder="Brief summary of the conversation..."
            rows={3}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300 placeholder:text-slate-400"
          />
        </div>

        {/* Notes */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Private Notes</p>
          <textarea
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Internal notes (not shared with candidate)..."
            rows={4}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="p-4 border-t border-slate-100">
        <button
          onClick={save}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-60"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save Notes & Flag'}
        </button>
      </div>
    </div>
  );
}

function LogActivityModal({ form, setForm, onSubmit, onClose, isSubmitting }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">Log Activity</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Channel */}
          <div className="grid grid-cols-4 gap-2">
            {['call', 'email', 'sms', 'teams'].map(ch => {
              const Icon = CHANNEL_ICONS[ch];
              return (
                <button
                  key={ch}
                  onClick={() => setForm(p => ({ ...p, channel: ch }))}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all',
                    form.channel === ch
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {ch.toUpperCase()}
                </button>
              );
            })}
          </div>

          {/* Direction */}
          <div className="flex gap-2">
            {['outbound', 'inbound'].map(d => (
              <button
                key={d}
                onClick={() => setForm(p => ({ ...p, direction: d }))}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-xl border transition-all capitalize',
                  form.direction === d
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                )}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Notes */}
          <textarea
            value={form.body}
            onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
            placeholder="What was discussed?"
            rows={3}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
          />

          <input
            value={form.summary}
            onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
            placeholder="One-line summary..."
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
          />

          {form.channel === 'call' && (
            <input
              type="number"
              value={form.duration}
              onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
              placeholder="Duration (seconds)"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
            />
          )}

          {/* Flag */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Set Status Flag</p>
            <div className="grid grid-cols-3 gap-1.5">
              {CONTACT_FLAGS.slice(0, 9).map(flag => (
                <button
                  key={flag.id}
                  onClick={() => setForm(p => ({ ...p, callFlag: p.callFlag === flag.id ? '' : flag.id }))}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all',
                    form.callFlag === flag.id ? flag.color : 'border-slate-200 text-slate-500'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', flag.dot)} />
                  {flag.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex-1 py-2.5 text-sm font-medium bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {isSubmitting ? 'Saving...' : 'Log Activity'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', colors[color])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label} this week</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    sent: 'bg-blue-100 text-blue-600',
    delivered: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-emerald-100 text-emerald-700',
    replied: 'bg-violet-100 text-violet-700',
    failed: 'bg-rose-100 text-rose-700',
    initiated: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full capitalize', map[status] || 'bg-slate-100 text-slate-500')}>
      {status || 'logged'}
    </span>
  );
}
