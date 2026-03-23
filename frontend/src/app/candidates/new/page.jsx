'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const initialState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  specialty: '',
  credential: '',
  state: '',
  city: '',
  notes: '',
};

export default function NewCandidatePage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const { data } = await api.post('/candidates', form);
      toast.success('Candidate created successfully.');
      router.push(`/candidates/${data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to create candidate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Add candidate</h1>
        <p className="mt-1 text-sm text-slate-500">Create a candidate directly in the staffing pipeline.</p>
      </div>
      <form className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-card md:grid-cols-2" onSubmit={handleSubmit}>
        {[
          ['First name', 'firstName'],
          ['Last name', 'lastName'],
          ['Email', 'email'],
          ['Phone', 'phone'],
          ['Specialty', 'specialty'],
          ['Credential', 'credential'],
          ['State', 'state'],
          ['City', 'city'],
        ].map(([label, key]) => (
          <label key={key} className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>{label}</span>
            <input
              value={form[key]}
              onChange={(e) => updateField(key, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
        ))}
        <label className="md:col-span-2 block space-y-1.5 text-sm font-medium text-slate-700">
          <span>Notes</span>
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <div className="md:col-span-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/candidates')}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-70"
          >
            {saving ? 'Saving…' : 'Create candidate'}
          </button>
        </div>
      </form>
    </div>
  );
}
