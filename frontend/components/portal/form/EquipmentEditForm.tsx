'use client';

import { useState } from 'react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalEquipment, EquipmentCategoryTree } from '@/lib/types/portal';
import { EquipmentFormFields, type EquipmentFormState } from './EquipmentFormFields';

interface EquipmentEditFormProps {
  equipment: PortalEquipment;
  categories: EquipmentCategoryTree[];
}

export function EquipmentEditForm({ equipment, categories }: EquipmentEditFormProps) {
  const [form, setForm] = useState<EquipmentFormState>({
    model: equipment.model ?? '',
    slug: equipment.slug ?? '',
    description: equipment.description ?? '',
    image_url: equipment.image_url ?? '',
    external_url: equipment.external_url ?? '',
    sort_order: String(equipment.sort_order ?? 0),
    category_id: equipment.category_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(patch: Partial<EquipmentFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.model.trim()) e.model = 'Model is required';
    if (!form.slug.trim()) e.slug = 'Slug is required';
    if (!form.category_id) e.category_id = 'Category is required';
    if (form.sort_order && isNaN(Number(form.sort_order))) e.sort_order = 'Sort order must be numeric';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setErrors({});
    try {
      await portalApiClient.equipment.update(equipment.id, {
        model: form.model,
        slug: form.slug,
        description: form.description,
        image_url: form.image_url,
        external_url: form.external_url,
        sort_order: Number(form.sort_order),
        category_id: form.category_id,
      });
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
      <EquipmentFormFields value={form} onChange={handleChange} errors={errors} categories={categories} />
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
