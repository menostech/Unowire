'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IndustryOption {
  id: string;
  label: string;
  categories: { id: string; label: string }[];
}

interface ProductTypeFormProps {
  initial?: {
    id: string;
    category_id: string;
    label: string;
    slug: string;
    size_system: string;
    filters: { spec_key: string; label: string; control: string; unit: string | null }[];
    sort_order: number;
  };
  industries: IndustryOption[];
  preselectCategoryId?: string;
}

const SIZE_SYSTEMS = ['awg', 'mm2', 'kcmil', 'none'];

export function ProductTypeForm({ initial, industries, preselectCategoryId }: ProductTypeFormProps) {
  const router = useRouter();

  // Derive initial industry from category_id (composite: "industry/category")
  const initialCategoryId = initial?.category_id ?? preselectCategoryId ?? '';
  const initialIndustryId = initialCategoryId.split('/')[0] ?? '';

  const [industryId, setIndustryId] = useState(initialIndustryId);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sizeSystem, setSizeSystem] = useState(initial?.size_system ?? 'awg');
  const [filtersText, setFiltersText] = useState(
    JSON.stringify(initial?.filters ?? [], null, 2)
  );
  const [filtersValid, setFiltersValid] = useState(true);
  const [filtersError, setFiltersError] = useState('');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cascade: categories available for selected industry
  const selectedIndustry = industries.find((i) => i.id === industryId);
  const availableCategories = selectedIndustry?.categories ?? [];

  function handleIndustryChange(value: string) {
    setIndustryId(value);
    setCategoryId('');
  }

  function handleFiltersChange(value: string) {
    setFiltersText(value);
    if (!value.trim()) {
      setFiltersValid(true);
      setFiltersError('');
      return;
    }
    try {
      JSON.parse(value);
      setFiltersValid(true);
      setFiltersError('');
    } catch (e) {
      setFiltersValid(false);
      setFiltersError((e as Error).message);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    // Composite ID: "industry_id/category_slug/product_type_slug"
    const compositeId = initial?.id || `${categoryId}/${slug}`;
    const parsedFilters = filtersText.trim() ? JSON.parse(filtersText) : [];

    const body = {
      id: compositeId,
      industry_id: industryId,
      category_id: categoryId,
      label,
      slug,
      size_system: sizeSystem,
      filters: parsedFilters,
      sort_order: Number(sortOrder),
    };

    try {
      const url = initial
        ? `/api/admin/product-types/${encodeURIComponent(compositeId)}`
        : '/api/admin/product-types';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Save failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this product type? If it has cables referencing it, deletion will be blocked.')) return;
    try {
      const res = await fetch(`/api/admin/product-types/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/product-types');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {/* Industry cascade */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry_id" className="text-sm font-medium text-gray-700">
          Industry
        </label>
        <select
          id="industry_id"
          required
          value={industryId}
          onChange={(e) => handleIndustryChange(e.target.value)}
          disabled={!!initial}
          className={inputClass}
        >
          <option value="">Select an industry…</option>
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category cascade */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category_id" className="text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          id="category_id"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!!initial || !industryId}
          className={inputClass}
        >
          <option value="">Select a category…</option>
          {availableCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.label}
            </option>
          ))}
        </select>
        {initial && (
          <p className="text-xs text-gray-500">
            Industry and category cannot be changed after creation
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="label" className="text-sm font-medium text-gray-700">
          Label
        </label>
        <input
          id="label"
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-gray-700">
          Slug
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="size_system" className="text-sm font-medium text-gray-700">
          Size System
        </label>
        <select
          id="size_system"
          required
          value={sizeSystem}
          onChange={(e) => setSizeSystem(e.target.value)}
          className={inputClass}
        >
          {SIZE_SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Filters JSON editor */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="filters" className="text-sm font-medium text-gray-700">
          Filters (JSON array)
        </label>
        <textarea
          id="filters"
          rows={10}
          value={filtersText}
          onChange={(e) => handleFiltersChange(e.target.value)}
          className={`${inputClass} font-mono text-xs ${
            !filtersValid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
          }`}
          placeholder='[{"spec_key":"awg_size","label":"AWG Size","control":"select","unit":null}]'
        />
        {!filtersValid && (
          <p className="text-xs text-red-600">JSON error: {filtersError}</p>
        )}
        <p className="text-xs text-gray-500">
          Array of filter objects. Each: &#123;&quot;spec_key&quot;, &quot;label&quot;, &quot;control&quot;, &quot;unit&quot;&#125;
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="sort_order" className="text-sm font-medium text-gray-700">
          Sort Order
        </label>
        <input
          id="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="image_url" className="text-sm font-medium text-gray-700">
          Image URL
        </label>
        <div className="flex gap-2">
          <input
            id="image_url"
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={`${inputClass} flex-1`}
            placeholder="/media/uploads/xxx.webp"
          />
          <a
            href="/admin/media"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
          >
            Media
          </a>
        </div>
        {imageUrl && (
          <div className="mt-2">
            <img src={imageUrl} alt="Preview" className="h-24 w-24 object-cover rounded" />
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !filtersValid}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/taxonomy/product-types"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Cancel
        </Link>
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
