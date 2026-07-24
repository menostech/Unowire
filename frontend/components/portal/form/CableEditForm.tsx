'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalCable } from '@/lib/types/portal';

export function CableEditForm({ cable }: { cable: PortalCable }) {
  const [model, setModel] = useState(cable.model ?? '');
  const [baseDescription, setBaseDescription] = useState(cable.base_description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!model.trim()) e.model = 'Model is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, { model, base_description: baseDescription });
      setMessage('Saved');
    } catch (err) {
      if (err instanceof PortalApiError && err.fieldErrors) setErrors(err.fieldErrors);
      else if (err instanceof PortalApiError) setMessage(err.message);
      else setMessage('Network error');
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
        {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
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
