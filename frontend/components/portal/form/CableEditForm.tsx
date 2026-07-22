'use client';

import { useState } from 'react';

export function CableEditForm({ cable }: { cable: any }) {
  const [model, setModel] = useState(cable.model ?? '');
  const [baseDescription, setBaseDescription] = useState(cable.base_description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/portal/cables/${cable.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, base_description: baseDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage(data.message || 'Save failed');
      } else {
        setMessage('Saved');
      }
    } catch {
      setMessage('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 rounded-lg bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Base Description</label>
        <textarea
          value={baseDescription}
          onChange={(e) => setBaseDescription(e.target.value)}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
