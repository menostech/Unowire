'use client';

import type { EquipmentCategoryTree } from '@/lib/types/portal';
import { ImageFieldWithPicker } from '@/components/portal/form/ImageFieldWithPicker';

export interface EquipmentFormState {
  model: string;
  slug: string;
  description: string;
  image_url: string;
  external_url: string;
  sort_order: string; // string for input control; converted to number on submit
  category_id: string;
  applicable_specs_json: string;
}

interface EquipmentFormFieldsProps {
  value: EquipmentFormState;
  onChange: (patch: Partial<EquipmentFormState>) => void;
  errors: Record<string, string>;
  categories: EquipmentCategoryTree[];
}

export function EquipmentFormFields({ value, onChange, errors, categories }: EquipmentFormFieldsProps) {
  // Flatten categories: include both top-level and children
  const flatCategories: { id: string; label: string }[] = [];
  for (const parent of categories) {
    flatCategories.push({ id: parent.id, label: parent.label });
    for (const child of parent.children ?? []) {
      flatCategories.push({ id: child.id, label: `${parent.label} — ${child.label}` });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
        <input
          value={value.model}
          onChange={(e) => onChange({ model: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.model && <p className="mt-1 text-sm text-red-600">{errors.model}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Slug</label>
        <input
          value={value.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.slug && <p className="mt-1 text-sm text-red-600">{errors.slug}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
        <select
          value={value.category_id}
          onChange={(e) => onChange({ category_id: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select category…</option>
          {flatCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        {errors.category_id && <p className="mt-1 text-sm text-red-600">{errors.category_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <ImageFieldWithPicker
        label="Image URL"
        value={value.image_url}
        onChange={(v) => onChange({ image_url: v })}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">External URL</label>
        <input
          value={value.external_url}
          onChange={(e) => onChange({ external_url: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="https://…"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
        <input
          type="number"
          value={value.sort_order}
          onChange={(e) => onChange({ sort_order: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {errors.sort_order && <p className="mt-1 text-sm text-red-600">{errors.sort_order}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Applicable Specs (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of spec rule objects, e.g. <code>{`[{ "spec_key": "conductor_area", "min": 0.1, "max": 1.0 }]`}</code>
        </p>
        <textarea
          value={value.applicable_specs_json}
          onChange={(e) => onChange({ applicable_specs_json: e.target.value })}
          placeholder='[{"spec_key":"conductor_area","min":0.1,"max":1.0}]'
          className={`font-mono text-sm min-h-[150px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            errors.applicable_specs_json
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          }`}
        />
        {errors.applicable_specs_json && (
          <p className="mt-1 text-sm text-red-600">{errors.applicable_specs_json}</p>
        )}
      </div>
    </div>
  );
}
