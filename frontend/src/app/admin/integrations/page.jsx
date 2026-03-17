'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Phone, Video, MessageSquare, CheckCircle2, XCircle,
  AlertCircle, Settings, ExternalLink, Zap, RefreshCw, Key,
  Eye, EyeOff, ChevronRight, Building2, Plus, Trash2
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const INTEGRATIONS = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send emails directly from ProviderIQ via your Gmail account. Track opens and replies.',
    icon: '📧',
    category: 'Email',
    authType: 'oauth',
    fields: [],
    docsUrl: 'https://developers.google.com/gmail',
    color: 'bg-red-50 border-red-200',
    iconBg: 'bg-red-100',
  },
  {
    id: 'outlook',
    name: 'Outlook / Microsoft 365',
    description: 'Connect Outlook for email sending, and enable Teams meeting scheduling.',
    icon: '📨',
    category: 'Email + Video',
    authType: 'oauth',
    fields: [],
    color: 'bg-blue-50 border-blue-200',
    iconBg: 'bg-blue-100',
  },
  {
    id: 'dialpad',
    name: 'Dialpad',
    description: 'Click-to-call physicians from ProviderIQ. Automatically log calls with recordings.',
    icon: '📞',
    category: 'Telephony',
    authType: 'api_key',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'defaultNumber', label: 'Default Caller ID', type: 'text', placeholder: '+15551234567' },
    ],
    color: 'bg-violet-50 border-violet-200',
    iconBg: 'bg-violet-100',
  },
  {
    id: '8x8',
    name: '8x8',
    description: 'Enterprise voice and SMS through 8x8. Supports auto-dialer and call recording.',
    icon: '☎️',
    category: 'Telephony',
    authType: 'api_key',
    fields: [
      { key: 'jwt', label: 'API JWT Token', type: 'password' },
      { key: 'callerId', label: 'Caller ID', type: 'text' },
      { key: 'defaultNumber', label: 'Default Number', type: 'text' },
    ],
    color: 'bg-indigo-50 border-indigo-200',
    iconBg: 'bg-indigo-100',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'SMS and voice calls via Twilio. Supports bulk SMS outreach campaigns.',
    icon: '💬',
    category: 'SMS + Voice',
    authType: 'api_key',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text' },
      { key: 'authToken', label: 'Auth Token', type: 'password' },
      { key: 'phoneNumber', label: 'Twilio Number', type: 'text', placeholder: '+15551234567' },
    ],
    color: 'bg-rose-50 border-rose-200',
    iconBg: 'bg-red-100',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Schedule and launch Teams video interviews directly from candidate profiles.',
    icon: '🎥',
    category: 'Video',
    authType: 'via_outlook',
    note: 'Enabled automatically when Outlook is connected.',
    color: 'bg-blue-50 border-blue-200',
    iconBg: 'bg-blue-100',
  },
];

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [configuring, setConfiguring] = useState(null);
  const [formData, setFormData] = useState({});
  const [showKeys, setShowKeys] = useState({});

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get('/admin/integrations').then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: ({ provider, credentials }) => api.post('/admin/integrations', { provider, credentials }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.provider} connected successfully`);
      setConfiguring(null);
      setFormData({});
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: () => toast.error('Failed to save integration'),
  });

  const deleteMutation = useMutation({
    mutationFn: (provider) => api.delete(`/admin/integrations/${provider}`),
    onSuccess: (_, provider) => {
      toast.success(`${provider} disconnected`);
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });

  const initiateOAuth = (provider) => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:4000';
    if (provider === 'gmail') {
      window.location.href = `${baseUrl}/api/communications/oauth/gmail/start`;
    } else if (provider === 'outlook') {
      window.location.href = `${baseUrl}/api/communications/oauth/outlook/start`;
    }
  };

  const isConnected = (id) => integrations.some(i => i.provider === id && i.is_active);

  const byCategory = INTEGRATIONS.reduce((acc, integration) => {
    const cat = integration.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(integration);
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Integrations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect your communication tools to send emails, make calls, and track all activity in ProviderIQ.
        </p>
      </div>

      {/* Integration Grid by Category */}
      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">{category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map(integration => {
              const connected = isConnected(integration.id);
              return (
                <motion.div
                  key={integration.id}
                  className={cn('rounded-2xl border p-5 transition-all', integration.color)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl', integration.iconBg)}>
                        {integration.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{integration.name}</p>
                        <p className="text-[11px] text-slate-500">{integration.category}</p>
                      </div>
                    </div>
                    {connected ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                        Not connected
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    {integration.description}
                    {integration.note && (
                      <span className="block mt-1 text-blue-600 font-medium">{integration.note}</span>
                    )}
                  </p>

                  <div className="flex items-center gap-2">
                    {integration.authType === 'oauth' ? (
                      <button
                        onClick={() => connected ? deleteMutation.mutate(integration.id) : initiateOAuth(integration.id)}
                        className={cn(
                          'flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all',
                          connected
                            ? 'text-rose-600 hover:bg-rose-100 border border-rose-200'
                            : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                        )}
                      >
                        {connected ? <><Trash2 className="w-3.5 h-3.5" /> Disconnect</> : <><ExternalLink className="w-3.5 h-3.5" /> Connect with OAuth</>}
                      </button>
                    ) : integration.authType === 'via_outlook' ? (
                      <span className="text-xs text-slate-400 italic">Requires Outlook connection</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfiguring(configuring === integration.id ? null : integration.id)}
                          className={cn(
                            'flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-xl transition-all',
                            connected
                              ? 'text-slate-600 border border-slate-200 hover:bg-slate-50'
                              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                          )}
                        >
                          <Key className="w-3.5 h-3.5" />
                          {connected ? 'Reconfigure' : 'Configure'}
                        </button>
                        {connected && (
                          <button
                            onClick={() => deleteMutation.mutate(integration.id)}
                            className="p-2 text-rose-400 hover:bg-rose-100 rounded-xl transition-colors"
                            title="Disconnect"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Expandable Config Form */}
                  <AnimatePresence>
                    {configuring === integration.id && integration.fields.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 pt-4 border-t border-white/60 space-y-3">
                          {integration.fields.map(field => (
                            <div key={field.key}>
                              <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                              <div className="relative">
                                <input
                                  type={field.type === 'password' && !showKeys[field.key] ? 'password' : 'text'}
                                  value={formData[field.key] || ''}
                                  onChange={e => setFormData(p => ({ ...p, [field.key]: e.target.value }))}
                                  placeholder={field.placeholder}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 pr-9"
                                />
                                {field.type === 'password' && (
                                  <button
                                    type="button"
                                    onClick={() => setShowKeys(p => ({ ...p, [field.key]: !p[field.key] }))}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                                  >
                                    {showKeys[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}

                          <button
                            onClick={() => saveMutation.mutate({ provider: integration.id, credentials: formData })}
                            disabled={saveMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 py-2 bg-brand-500 text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors shadow-sm disabled:opacity-60"
                          >
                            {saveMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {saveMutation.isPending ? 'Saving...' : 'Save & Connect'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
