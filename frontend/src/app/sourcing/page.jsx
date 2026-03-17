'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, User, MapPin, Hash, Linkedin, Link2, Globe, Zap,
  ChevronRight, RefreshCw, UserPlus, CheckCircle2, Clock,
  Stethoscope, Phone, Award, Building2, Star, ExternalLink,
  AlertCircle, Loader2, ScanSearch, Sparkles, Filter,
  Database, FileSearch, ArrowRight, BadgeCheck
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const SEARCH_TABS = [
  {
    id: 'smart',
    label: 'Smart Search',
    icon: Sparkles,
    placeholder: 'Type a name, NPI, or paste any URL...',
    description: 'Auto-detects NPI, LinkedIn, Doximity, or searches by name',
    color: 'violet',
  },
  {
    id: 'name',
    label: 'Name + Location',
    icon: User,
    placeholder: 'Dr. John Smith',
    description: 'Search across NPI registry + all directories',
    color: 'brand',
  },
  {
    id: 'npi',
    label: 'NPI Number',
    icon: Hash,
    placeholder: '1234567890',
    description: 'Direct NPI registry + enriched database lookup',
    color: 'emerald',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    placeholder: 'https://linkedin.com/in/dr-john-smith',
    description: 'Extract provider data from LinkedIn profile',
    color: 'blue',
  },
  {
    id: 'doximity',
    label: 'Doximity',
    icon: Link2,
    placeholder: 'https://doximity.com/pub/john-smith-md',
    description: 'Pull full profile from Doximity',
    color: 'teal',
  },
];

const SOURCE_BADGES = {
  npi_registry: { label: 'NPI', color: 'bg-blue-100 text-blue-700' },
  doximity: { label: 'Doximity', color: 'bg-teal-100 text-teal-700' },
  linkedin: { label: 'LinkedIn', color: 'bg-sky-100 text-sky-700' },
  healthgrades: { label: 'Healthgrades', color: 'bg-green-100 text-green-700' },
  medical_board: { label: 'Med Board', color: 'bg-amber-100 text-amber-700' },
  abms: { label: 'ABMS', color: 'bg-purple-100 text-purple-700' },
};

export default function SourcingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('smart');
  const [searchInput, setSearchInput] = useState('');
  const [nameFields, setNameFields] = useState({ firstName: '', lastName: '', specialty: '', state: '', city: '' });
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedResult, setSelectedResult] = useState(null);
  const [deepScrapeStatus, setDeepScrapeStatus] = useState({});
  const searchRef = useRef(null);

  const addToPipelineMutation = useMutation({
    mutationFn: (data) => api.post('/sourcing/add-to-pipeline', data),
    onSuccess: (_, vars) => {
      toast.success('Provider added to your pipeline!');
      setResults(prev => prev.map(r =>
        r.npi === vars.npi ? { ...r, inPipeline: true } : r
      ));
    },
    onError: (err) => {
      if (err.response?.status === 409) toast.error('Already in pipeline');
      else toast.error('Failed to add to pipeline');
    },
  });

  const handleSearch = async () => {
    if (activeTab === 'name' && !nameFields.lastName && !nameFields.firstName) {
      toast.error('Enter at least a first or last name');
      return;
    }
    if (activeTab !== 'name' && !searchInput.trim()) {
      toast.error('Enter a search query');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const payload = {
        searchType: activeTab,
        query: searchInput,
        ...nameFields,
        linkedinUrl: activeTab === 'linkedin' ? searchInput : undefined,
        doximityUrl: activeTab === 'doximity' ? searchInput : undefined,
        deepScrape: true,
      };

      const { data } = await api.post('/sourcing/search', payload);
      setResults(data.results || []);

      if (data.scrapeQueued) {
        toast.success('Deep enrichment queued — results updating shortly', { duration: 4000 });
        // Poll for updates
        if (data.results?.[0]?.npi) {
          pollScrapeStatus(data.results[0].npi);
        }
      }
    } catch (err) {
      toast.error('Search failed — please try again');
    } finally {
      setIsSearching(false);
    }
  };

  const pollScrapeStatus = (npi) => {
    setDeepScrapeStatus(p => ({ ...p, [npi]: 'processing' }));
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/sourcing/scrape-status/${npi}`);
        if (data.status === 'completed') {
          setDeepScrapeStatus(p => ({ ...p, [npi]: 'completed' }));
          clearInterval(interval);
          // Refresh result
          const { data: fresh } = await api.get(`/providers/npi/${npi}`);
          setResults(prev => prev.map(r => r.npi === npi ? { ...r, ...fresh } : r));
          toast.success('Provider data enriched!', { icon: '✨' });
        } else if (data.status === 'failed') {
          clearInterval(interval);
          setDeepScrapeStatus(p => ({ ...p, [npi]: 'failed' }));
        }
      } catch { clearInterval(interval); }
    }, 3000);
    setTimeout(() => clearInterval(interval), 120000); // 2min max
  };

  const triggerDeepScrape = async (result) => {
    try {
      await api.post('/sourcing/deep-scrape', {
        npi: result.npi,
        linkedinUrl: result.linkedinUrl,
        doximityUrl: result.doximityUrl,
        providerName: `${result.firstName} ${result.lastName}`,
        specialty: result.specialty,
        state: result.state,
      });
      toast.success('Deep enrichment started');
      if (result.npi) pollScrapeStatus(result.npi);
    } catch {
      toast.error('Failed to start enrichment');
    }
  };

  const activeTabConfig = SEARCH_TABS.find(t => t.id === activeTab);

  return (
    <div className="flex h-full">
      {/* Left: Search Panel */}
      <div className="w-full max-w-2xl flex flex-col border-r border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
                <ScanSearch className="w-5 h-5 text-brand-500" />
                Provider Sourcing
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Deep search across NPI Registry, LinkedIn, Doximity, medical boards + more
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
            {SEARCH_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchInput(''); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0',
                    isActive
                      ? 'bg-white shadow-sm text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="mt-3">
            {activeTab === 'name' ? (
              <NameSearchForm fields={nameFields} onChange={setNameFields} onSearch={handleSearch} isSearching={isSearching} />
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  {activeTab === 'npi' && <Hash className="w-4 h-4 text-slate-400" />}
                  {activeTab === 'linkedin' && <Linkedin className="w-4 h-4 text-slate-400" />}
                  {activeTab === 'doximity' && <Link2 className="w-4 h-4 text-slate-400" />}
                  {activeTab === 'smart' && <Search className="w-4 h-4 text-slate-400" />}
                </div>
                <input
                  ref={searchRef}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={activeTabConfig?.placeholder}
                  className="w-full pl-10 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300
                    placeholder:text-slate-400 transition-all"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3.5 py-1.5
                    bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 
                    disabled:opacity-60 transition-all shadow-sm"
                >
                  {isSearching
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />
                  }
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
            )}

            {/* Source badges */}
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-[11px] text-slate-400 font-medium">Sources:</span>
              {['NPI Registry', 'Doximity', 'LinkedIn', 'Healthgrades', 'Med Boards', 'ABMS'].map(s => (
                <span key={s} className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isSearching && (
            <SearchingAnimation />
          )}

          {!isSearching && hasSearched && results.length === 0 && (
            <EmptyResults />
          )}

          {!isSearching && !hasSearched && (
            <SearchPrompt tab={activeTabConfig} />
          )}

          {!isSearching && results.map((result, i) => (
            <motion.div
              key={result.id || result.npi || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <ProviderResultCard
                result={result}
                isSelected={selectedResult?.npi === result.npi}
                scrapeStatus={deepScrapeStatus[result.npi]}
                onSelect={() => setSelectedResult(prev => prev?.npi === result.npi ? null : result)}
                onAddToPipeline={() => addToPipelineMutation.mutate({ providerId: result.id, npi: result.npi })}
                onDeepScrape={() => triggerDeepScrape(result)}
                isAdding={addToPipelineMutation.isPending && addToPipelineMutation.variables?.npi === result.npi}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right: Provider Detail Panel */}
      <AnimatePresence>
        {selectedResult && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto bg-white"
          >
            <ProviderDetailPanel
              provider={selectedResult}
              scrapeStatus={deepScrapeStatus[selectedResult.npi]}
              onClose={() => setSelectedResult(null)}
              onAddToPipeline={() => addToPipelineMutation.mutate({ providerId: selectedResult.id, npi: selectedResult.npi })}
              onDeepScrape={() => triggerDeepScrape(selectedResult)}
              isAdding={addToPipelineMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NameSearchForm({ fields, onChange, onSearch, isSearching }) {
  const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  const SPECIALTIES = ['Internal Medicine','Family Medicine','Emergency Medicine','Hospitalist','Cardiology','Orthopedic Surgery','Anesthesiology','Radiology','Psychiatry','Neurology','Gastroenterology','Pulmonology','Nephrology','Oncology','Urology','Dermatology','Pediatrics','OB/GYN','General Surgery','Neurosurgery','Critical Care'];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={fields.firstName}
          onChange={e => onChange(p => ({ ...p, firstName: e.target.value }))}
          placeholder="First name"
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
        />
        <input
          value={fields.lastName}
          onChange={e => onChange(p => ({ ...p, lastName: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && onSearch()}
          placeholder="Last name *"
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <select
          value={fields.specialty}
          onChange={e => onChange(p => ({ ...p, specialty: e.target.value }))}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-700 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
        >
          <option value="">Any Specialty</option>
          {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select
          value={fields.state}
          onChange={e => onChange(p => ({ ...p, state: e.target.value }))}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-700 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
        >
          <option value="">Any State</option>
          {US_STATES.map(s => <option key={s}>{s}</option>)}
        </select>
        <input
          value={fields.city}
          onChange={e => onChange(p => ({ ...p, city: e.target.value }))}
          placeholder="City"
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-300"
        />
      </div>
      <button
        onClick={onSearch}
        disabled={isSearching || (!fields.firstName && !fields.lastName)}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 disabled:opacity-60 transition-all"
      >
        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        {isSearching ? 'Searching all sources...' : 'Deep Search All Sources'}
      </button>
    </div>
  );
}

function ProviderResultCard({ result, isSelected, scrapeStatus, onSelect, onAddToPipeline, onDeepScrape, isAdding }) {
  const quality = Math.round((result.data_quality_score || result.dataQualityScore || 0) * 100);

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 rounded-xl border cursor-pointer transition-all',
        isSelected
          ? 'bg-brand-50 border-brand-200 shadow-glow-sm'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-card'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-slate-500" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-slate-900">
              {result.firstName || result.first_name
                ? `Dr. ${result.firstName || result.first_name} ${result.lastName || result.last_name}`
                : `Dr. ${result.lastName || result.last_name}`}
            </p>
            {(result.credential) && (
              <span className="text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                {result.credential}
              </span>
            )}
            {result.inPipeline && (
              <span className="flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                <CheckCircle2 className="w-3 h-3" /> In Pipeline
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            {(result.specialty) && (
              <span className="flex items-center gap-1">
                <Stethoscope className="w-3 h-3" />{result.specialty}
              </span>
            )}
            {(result.city || result.state) && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {[result.city, result.state].filter(Boolean).join(', ')}
              </span>
            )}
            {result.npi && (
              <span className="flex items-center gap-1 font-mono">
                <Hash className="w-3 h-3" />{result.npi}
              </span>
            )}
          </div>

          {/* Data source badges */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {result.linkedinUrl && (
              <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                <Linkedin className="w-2.5 h-2.5" /> LinkedIn
              </span>
            )}
            {result.doximityUrl && (
              <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">Doximity</span>
            )}
            {result.boardCertifications?.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                <Award className="w-2.5 h-2.5" /> Board Certified
              </span>
            )}
            {result.enrichedAt && (
              <span className="text-[10px] text-slate-400">Enriched {new Date(result.enrichedAt || result.enriched_at).toLocaleDateString()}</span>
            )}
            {scrapeStatus === 'processing' && (
              <span className="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1 animate-pulse">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Enriching...
              </span>
            )}
            {scrapeStatus === 'completed' && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Just Enriched
              </span>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {quality > 0 && (
            <div className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-lg',
              quality >= 70 ? 'bg-emerald-100 text-emerald-700'
                : quality >= 40 ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-500'
            )}>
              {quality}%
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-1">
            {!result.enrichedAt && !result.enriched_at && result.npi && scrapeStatus !== 'processing' && (
              <button
                onClick={e => { e.stopPropagation(); onDeepScrape(); }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors border border-brand-200"
                title="Run deep enrichment"
              >
                <Zap className="w-3 h-3" /> Enrich
              </button>
            )}

            <button
              onClick={e => { e.stopPropagation(); !result.inPipeline && onAddToPipeline(); }}
              disabled={isAdding || result.inPipeline}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg transition-all',
                result.inPipeline
                  ? 'bg-emerald-100 text-emerald-600 cursor-default'
                  : 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
              )}
            >
              {isAdding ? <Loader2 className="w-3 h-3 animate-spin" />
                : result.inPipeline ? <CheckCircle2 className="w-3 h-3" />
                : <UserPlus className="w-3 h-3" />}
              {result.inPipeline ? 'Added' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderDetailPanel({ provider, scrapeStatus, onClose, onAddToPipeline, onDeepScrape, isAdding }) {
  const { data: enriched } = useQuery({
    queryKey: ['provider', provider.npi],
    queryFn: () => provider.npi ? api.get(`/providers/npi/${provider.npi}`).then(r => r.data) : null,
    enabled: !!provider.npi,
  });

  const p = enriched || provider;
  const firstName = p.first_name || p.firstName;
  const lastName = p.last_name || p.lastName;
  const specialty = p.specialty;
  const credential = p.credential;
  const city = p.city;
  const state = p.state;
  const phone = p.phone;
  const boardCerts = p.board_certifications || p.boardCertifications || [];
  const hospitals = p.hospital_affiliations || p.hospitalAffiliations || [];
  const education = p.education || [];
  const quality = Math.round((p.data_quality_score || 0) * 100);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 flex items-center justify-center shadow-sm">
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">
                Dr. {firstName} {lastName}{credential && `, ${credential}`}
              </h2>
              <p className="text-sm text-slate-400">{specialty}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">✕</button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onAddToPipeline}
            disabled={isAdding || p.inPipeline}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-xl transition-all',
              p.inPipeline
                ? 'bg-emerald-100 text-emerald-700 cursor-default'
                : 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm'
            )}
          >
            {p.inPipeline ? <><CheckCircle2 className="w-4 h-4" /> In Pipeline</>
              : isAdding ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
              : <><UserPlus className="w-4 h-4" /> Add to Pipeline</>}
          </button>

          {scrapeStatus !== 'processing' && (
            <button
              onClick={onDeepScrape}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-xl transition-colors border border-violet-200"
            >
              {scrapeStatus === 'processing'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enriching</>
                : <><Zap className="w-4 h-4" /> Deep Enrich</>
              }
            </button>
          )}
        </div>

        {scrapeStatus === 'processing' && (
          <div className="mt-2 px-3 py-2 bg-brand-50 rounded-xl flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-brand-500 animate-spin flex-shrink-0" />
            <p className="text-xs text-brand-700">
              Searching LinkedIn, Doximity, medical boards, Healthgrades... This takes ~30 seconds.
            </p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Contact Info */}
        <Section title="Contact Information">
          <InfoGrid>
            {phone && <InfoItem icon={Phone} label="Phone" value={phone} />}
            {p.email && <InfoItem icon={Globe} label="Email" value={p.email} />}
            {(city || state) && <InfoItem icon={MapPin} label="Location" value={[city, state].filter(Boolean).join(', ')} />}
            {p.npi && <InfoItem icon={Hash} label="NPI" value={p.npi} mono />}
            {p.practice_name && <InfoItem icon={Building2} label="Practice" value={p.practice_name} />}
          </InfoGrid>
        </Section>

        {/* Online Profiles */}
        {(p.linkedinUrl || p.linkedin_url || p.doximityUrl || p.doximity_url || p.healthgradesUrl || p.healthgrades_url) && (
          <Section title="Online Profiles">
            <div className="space-y-2">
              {(p.linkedinUrl || p.linkedin_url) && (
                <ProfileLink icon={Linkedin} label="LinkedIn Profile" url={p.linkedinUrl || p.linkedin_url} color="sky" />
              )}
              {(p.doximityUrl || p.doximity_url) && (
                <ProfileLink icon={Link2} label="Doximity Profile" url={p.doximityUrl || p.doximity_url} color="teal" />
              )}
              {(p.healthgradesUrl || p.healthgrades_url) && (
                <ProfileLink icon={Star} label="Healthgrades Profile" url={p.healthgradesUrl || p.healthgrades_url} color="green" />
              )}
            </div>
          </Section>
        )}

        {/* Board Certifications */}
        {boardCerts.length > 0 && (
          <Section title="Board Certifications">
            <div className="flex flex-wrap gap-2">
              {boardCerts.map((cert, i) => (
                <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-100">
                  <BadgeCheck className="w-3.5 h-3.5 text-amber-500" />
                  {typeof cert === 'string' ? cert : cert.specialty || cert.board}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Hospital Affiliations */}
        {hospitals.length > 0 && (
          <Section title="Hospital Affiliations">
            <div className="space-y-1.5">
              {hospitals.slice(0, 8).map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  {h}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Education */}
        {education.length > 0 && (
          <Section title="Education & Training">
            <div className="space-y-2">
              {(Array.isArray(education) ? education : []).map((edu, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl">
                  <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-brand-600 text-[10px] font-bold">E</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{edu.school || edu}</p>
                    {edu.degree && <p className="text-xs text-slate-400">{edu.degree} {edu.year && `· ${edu.year}`}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Data Quality */}
        <Section title="Data Completeness">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Profile completeness</span>
              <span className="text-sm font-semibold text-slate-800">{quality}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${quality}%` }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  'h-full rounded-full',
                  quality >= 70 ? 'bg-emerald-500' : quality >= 40 ? 'bg-amber-500' : 'bg-slate-300'
                )}
              />
            </div>
            {p.enriched_at && (
              <p className="text-xs text-slate-400">
                Last enriched: {new Date(p.enriched_at).toLocaleDateString()}
              </p>
            )}
            <p className="text-xs text-slate-400">
              Sources: {(p.enrichment_sources || []).join(', ') || 'NPI Registry'}
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InfoGrid({ children }) {
  return <div className="grid grid-cols-1 gap-2">{children}</div>;
}

function InfoItem({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium">{label}</p>
        <p className={cn('text-sm text-slate-800 truncate', mono && 'font-mono')}>{value}</p>
      </div>
    </div>
  );
}

function ProfileLink({ icon: Icon, label, url, color }) {
  const colors = {
    sky: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    teal: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
    green: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  };
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors', colors[color])}
    >
      <Icon className="w-4 h-4" />
      {label}
      <ExternalLink className="w-3.5 h-3.5 ml-auto opacity-60" />
    </a>
  );
}

function SearchingAnimation() {
  const sources = ['NPI Registry', 'Doximity', 'LinkedIn', 'Healthgrades', 'Medical Board', 'ABMS'];
  const [current, setCurrentSource] = useState(0);

  useState(() => {
    const interval = setInterval(() => setCurrentSource(p => (p + 1) % sources.length), 600);
    return () => clearInterval(interval);
  });

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
        <ScanSearch className="w-6 h-6 text-brand-500 animate-pulse" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-700">Searching all sources...</p>
        <p className="text-xs text-brand-500 mt-1 animate-pulse">{sources[current]}</p>
      </div>
      <div className="flex gap-1.5">
        {sources.map((_, i) => (
          <div key={i} className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === current ? 'bg-brand-500' : 'bg-slate-200')} />
        ))}
      </div>
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <FileSearch className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-600">No providers found</p>
      <p className="text-xs text-slate-400 mt-1">Try a different search or use the Smart Search tab</p>
    </div>
  );
}

function SearchPrompt({ tab }) {
  if (!tab) return null;
  const Icon = tab.icon;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 border border-brand-100 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-brand-400" />
      </div>
      <p className="text-sm font-semibold text-slate-700 mb-1">{tab.label}</p>
      <p className="text-xs text-slate-400 max-w-xs">{tab.description}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {['NPI Registry', 'Doximity', 'LinkedIn', 'Healthgrades', 'State Med Boards', 'ABMS', 'Doctor.com', 'Vitals'].map(s => (
          <span key={s} className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{s}</span>
        ))}
      </div>
    </div>
  );
}

function useState(fn) {
  const [, set] = require('react').useState(0);
  require('react').useEffect(() => {
    const cleanup = fn();
    return cleanup;
  }, []);
}
