'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Database, MapPin, Phone, Star, Plus,
  ChevronRight, Stethoscope, Award, Building2, RefreshCw,
  UserPlus, X, Check, AlertCircle, ExternalLink, Zap
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, debounce } from '@/lib/utils';
import toast from 'react-hot-toast';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

const SPECIALTIES = [
  'Internal Medicine', 'Family Medicine', 'Emergency Medicine', 'Hospitalist',
  'Cardiology', 'Orthopedic Surgery', 'Anesthesiology', 'Radiology',
  'Psychiatry', 'Neurology', 'Gastroenterology', 'Pulmonology', 'Nephrology',
  'Oncology', 'Urology', 'Dermatology', 'Pediatrics', 'OB/GYN', 'General Surgery',
  'Neurosurgery', 'Critical Care', 'Infectious Disease',
];

export default function ProvidersPage() {
  const [filters, setFilters] = useState({ q: '', specialty: '', state: '', city: '' });
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [page, setPage] = useState(0);
  const PER_PAGE = 25;

  const debouncedSearch = useCallback(
    debounce((f) => { setDebouncedFilters(f); setPage(0); }, 350),
    []
  );

  const handleFilterChange = (key, value) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    debouncedSearch(next);
  };

  const clearFilters = () => {
    const empty = { q: '', specialty: '', state: '', city: '' };
    setFilters(empty);
    setDebouncedFilters(empty);
    setPage(0);
  };

  const { data, isFetching } = useQuery({
    queryKey: ['providers', debouncedFilters, page],
    queryFn: () => api.get('/providers/search', {
      params: {
        ...debouncedFilters,
        limit: PER_PAGE,
        offset: page * PER_PAGE,
      }
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const addToPipelineMutation = useMutation({
    mutationFn: ({ providerId }) => api.post(`/providers/${providerId}/add-to-pipeline`),
    onSuccess: () => {
      toast.success('Provider added to pipeline!');
      setSelectedProvider(null);
    },
    onError: (err) => {
      if (err.response?.status === 409) {
        toast.error('Provider already in your pipeline');
      } else {
        toast.error('Failed to add provider');
      }
    },
  });

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex h-full">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-5 bg-white border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Provider Database</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {data?.total ? `${data.total.toLocaleString()} healthcare providers` : 'Search NPI Registry'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl border transition-all',
                  showFilters
                    ? 'bg-brand-50 border-brand-200 text-brand-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={filters.q}
              onChange={e => handleFilterChange('q', e.target.value)}
              placeholder="Search by name, NPI, specialty..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm
                focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300
                placeholder:text-slate-400 transition-all"
            />
            {isFetching && (
              <RefreshCw className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-500 animate-spin" />
            )}
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Specialty</label>
                    <select
                      value={filters.specialty}
                      onChange={e => handleFilterChange('specialty', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700
                        focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
                    >
                      <option value="">All Specialties</option>
                      {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">State</label>
                    <select
                      value={filters.state}
                      onChange={e => handleFilterChange('state', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700
                        focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
                    >
                      <option value="">All States</option>
                      {US_STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">City</label>
                    <input
                      value={filters.city}
                      onChange={e => handleFilterChange('city', e.target.value)}
                      placeholder="e.g. Chicago"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm
                        focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300
                        placeholder:text-slate-400"
                    />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Clear all filters
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!data?.providers?.length && !isFetching && (
            <EmptyState />
          )}
          {data?.providers?.map((provider, i) => (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
            >
              <ProviderCard
                provider={provider}
                isSelected={selectedProvider?.id === provider.id}
                onSelect={() => setSelectedProvider(
                  selectedProvider?.id === provider.id ? null : provider
                )}
                onAddToPipeline={() => addToPipelineMutation.mutate({ providerId: provider.id })}
                isAdding={addToPipelineMutation.isPending && addToPipelineMutation.variables?.providerId === provider.id}
              />
            </motion.div>
          ))}

          {/* Pagination */}
          {data?.total > PER_PAGE && (
            <div className="flex items-center justify-between pt-4 pb-2">
              <p className="text-sm text-slate-500">
                Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, data.total)} of {data.total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * PER_PAGE >= data.total}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provider Detail Panel */}
      <AnimatePresence>
        {selectedProvider && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="border-l border-slate-100 bg-white overflow-hidden flex-shrink-0"
          >
            <ProviderDetailPanel
              provider={selectedProvider}
              onClose={() => setSelectedProvider(null)}
              onAddToPipeline={() => addToPipelineMutation.mutate({ providerId: selectedProvider.id })}
              isAdding={addToPipelineMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProviderCard({ provider, isSelected, onSelect, onAddToPipeline, isAdding }) {
  const qualityPct = Math.round((provider.data_quality_score || 0) * 100);
  const qualityColor = qualityPct >= 70 ? 'text-emerald-600 bg-emerald-50' : qualityPct >= 40 ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-100';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all',
        isSelected
          ? 'bg-brand-50 border-brand-200 shadow-glow-sm'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-card'
      )}
    >
      {/* Avatar */}
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Stethoscope className="w-5 h-5 text-slate-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {provider.first_name ? `Dr. ${provider.first_name} ${provider.last_name}` : `Dr. ${provider.last_name}`}
          </p>
          {provider.credential && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">
              {provider.credential}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {provider.specialty && (
            <span className="flex items-center gap-1 truncate">
              <Stethoscope className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{provider.specialty}</span>
            </span>
          )}
          {provider.state && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <MapPin className="w-3 h-3" />
              {provider.city ? `${provider.city}, ${provider.state}` : provider.state}
            </span>
          )}
        </div>
      </div>

      {/* Quality & Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {qualityPct > 0 && (
          <span className={cn('text-xs font-medium px-2 py-1 rounded-lg', qualityColor)}>
            {qualityPct}%
          </span>
        )}
        {provider.board_certifications?.length > 0 && (
          <Award className="w-4 h-4 text-amber-500" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAddToPipeline(); }}
          disabled={isAdding}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
            isAdding
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
          )}
        >
          {isAdding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function ProviderDetailPanel({ provider, onClose, onAddToPipeline, isAdding }) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">
              Dr. {provider.first_name} {provider.last_name}
            </p>
            <p className="text-sm text-slate-400">{provider.credential}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Quick Info */}
        <div className="space-y-2">
          {provider.specialty && (
            <InfoRow icon={Stethoscope} label="Specialty" value={provider.specialty} />
          )}
          {(provider.city || provider.state) && (
            <InfoRow icon={MapPin} label="Location" value={[provider.city, provider.state].filter(Boolean).join(', ')} />
          )}
          {provider.phone && (
            <InfoRow icon={Phone} label="Phone" value={provider.phone} />
          )}
          {provider.practice_name && (
            <InfoRow icon={Building2} label="Practice" value={provider.practice_name} />
          )}
        </div>

        {/* NPI */}
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-medium text-slate-500 mb-1">NPI Number</p>
          <p className="text-sm font-mono text-slate-800">{provider.npi}</p>
        </div>

        {/* Board Certifications */}
        {provider.board_certifications?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Board Certifications</p>
            <div className="flex flex-wrap gap-1.5">
              {provider.board_certifications.map((cert, i) => (
                <span key={i} className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                  {cert}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hospital Affiliations */}
        {provider.hospital_affiliations?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Hospital Affiliations</p>
            <div className="space-y-1">
              {provider.hospital_affiliations.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  {h}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Quality */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Completeness</p>
            <span className="text-xs font-semibold text-slate-700">
              {Math.round((provider.data_quality_score || 0) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all"
              style={{ width: `${(provider.data_quality_score || 0) * 100}%` }}
            />
          </div>
          {provider.enriched_at && (
            <p className="text-[11px] text-slate-400 mt-1.5">
              Enriched {new Date(provider.enriched_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        <button
          onClick={onAddToPipeline}
          disabled={isAdding}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white 
            text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60 shadow-sm"
        >
          {isAdding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {isAdding ? 'Adding to Pipeline...' : 'Add to Pipeline'}
        </button>
        <button className="w-full flex items-center justify-center gap-2 py-2 text-slate-600 
          text-sm font-medium rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
          <Zap className="w-4 h-4" />
          Generate Outreach Email
        </button>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium">{label}</p>
        <p className="text-sm text-slate-700 truncate">{value}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Database className="w-8 h-8 text-slate-300" />
      </div>
      <p className="text-base font-semibold text-slate-700 mb-1">No providers found</p>
      <p className="text-sm text-slate-400">Try adjusting your search or filters</p>
    </div>
  );
}
