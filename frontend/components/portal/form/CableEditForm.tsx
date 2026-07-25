'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalCable, TaxonomyIndustry } from '@/lib/types/portal';
import { CableFormFields, type CableFormState } from './CableFormFields';

interface CableEditFormProps {
  cable: PortalCable;
  taxonomy: TaxonomyIndustry[];
}

export function CableEditForm({ cable, taxonomy }: CableEditFormProps) {
  const [form, setForm] = useState<CableFormState>({
    model: cable.model ?? '',
    slug: cable.slug ?? '',
    size_system: (cable.size_system as CableFormState['size_system']) ?? 'awg',
    base_description: cable.base_description ?? '',
    meta_title: cable.meta_title ?? '',
    meta_description: cable.meta_description ?? '',
    image_url: cable.image_url ?? '',
    industry_id: cable.industry_id ?? '',
    category_id: cable.category_id ?? '',
    product_type_id: cable.product_type_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<CableFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.size_system) e.size_system = 'Size system is required';
    if (!form.industry_id) e.industry_id = 'Industry is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (!form.product_type_id) e.product_type_id = 'Product type is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.cables.update(cable.id, form);
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
      <CableFormFields value={form} onChange={handleChange} errors={errors} taxonomy={taxonomy} />
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
