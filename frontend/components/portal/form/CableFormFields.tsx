'use client';

import type { TaxonomyIndustry } from '@/lib/types/portal';
import { ImageFieldWithPicker } from '@/components/portal/form/ImageFieldWithPicker';

export interface CableFormState {
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description: string;
  meta_title: string;
  meta_description: string;
  image_url: string;
  industry_id: string;
  category_id: string;
  product_type_id: string;
  common_specs_json: string;
  variants_json: string;
}

interface CableFormFieldsProps {
  value: CableFormState;
  onChange: (patch: Partial<CableFormState>) => void;
  errors: Record<string, string>;
  taxonomy: TaxonomyIndustry[];
}

export function CableFormFields({ value, onChange, errors, taxonomy }: CableFormFieldsProps) {
  // Derive filtered categories and product types from current selections
  const selectedIndustry = taxonomy.find((i) => i.id === value.industry_id);
  const categories = selectedIndustry?.categories ?? [];
  const selectedCategory = categories.find((c) => c.id === value.category_id);
  const productTypes = selectedCategory?.product_types ?? [];

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
        <label className="mb-1 block text-sm font-medium text-gray-700">Size System</label>
        <select
          value={value.size_system}
          onChange={(e) => onChange({ size_system: e.target.value as CableFormState['size_system'] })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="awg">AWG</option>
          <option value="mm2">mm²</option>
          <option value="kcmil">kcmil</option>
          <option value="none">None</option>
        </select>
        {errors.size_system && <p className="mt-1 text-sm text-red-600">{errors.size_system}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Industry</label>
        <select
          value={value.industry_id}
          onChange={(e) => onChange({ industry_id: e.target.value, category_id: '', product_type_id: '' })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select industry…</option>
          {taxonomy.map((ind) => (
            <option key={ind.id} value={ind.id}>{ind.label}</option>
          ))}
        </select>
        {errors.industry_id && <p className="mt-1 text-sm text-red-600">{errors.industry_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
        <select
          value={value.category_id}
          onChange={(e) => onChange({ category_id: e.target.value, product_type_id: '' })}
          disabled={!categories.length}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select category…</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
        {errors.category_id && <p className="mt-1 text-sm text-red-600">{errors.category_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Product Type</label>
        <select
          value={value.product_type_id}
          onChange={(e) => onChange({ product_type_id: e.target.value })}
          disabled={!productTypes.length}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Select product type…</option>
          {productTypes.map((pt) => (
            <option key={pt.id} value={pt.id}>{pt.label}</option>
          ))}
        </select>
        {errors.product_type_id && <p className="mt-1 text-sm text-red-600">{errors.product_type_id}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Base Description</label>
        <textarea
          value={value.base_description}
          onChange={(e) => onChange({ base_description: e.target.value })}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Meta Title</label>
        <input
          value={value.meta_title}
          onChange={(e) => onChange({ meta_title: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Meta Description</label>
        <textarea
          value={value.meta_description}
          onChange={(e) => onChange({ meta_description: e.target.value })}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <ImageFieldWithPicker
        label="Image URL"
        value={value.image_url}
        onChange={(v) => onChange({ image_url: v })}
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Common Specs (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of spec objects: <code>{`[{ "spec_key", "label", "value_string", "value_number", "unit", "spec_type", "filterable" }]`}</code>
        </p>
        <textarea
          value={value.common_specs_json}
          onChange={(e) => onChange({ common_specs_json: e.target.value })}
          className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            errors.common_specs_json
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-accent-foreground focus:ring-accent-foreground'
          }`}
        />
        {errors.common_specs_json && (
          <p className="mt-1 text-sm text-red-600">{errors.common_specs_json}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Variants (JSON)</label>
        <p className="mb-1 text-xs text-gray-500">
          Array of variant objects: <code>{`[{ "slug", "sort_order", "specs": [{ "spec_key", "label", ... }] }]`}</code>
        </p>
        <textarea
          value={value.variants_json}
          onChange={(e) => onChange({ variants_json: e.target.value })}
          className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            errors.variants_json
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-accent-foreground focus:ring-accent-foreground'
          }`}
        />
        {errors.variants_json && (
          <p className="mt-1 text-sm text-red-600">{errors.variants_json}</p>
        )}
      </div>
    </div>
  );
}
