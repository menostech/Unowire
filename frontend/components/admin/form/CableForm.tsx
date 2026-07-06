'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface CableFormProps {
  // Cable detail in backend format (spec_key/value_string/value_number, etc.)
  // Typed as `any` to allow round-tripping raw backend JSON through the editors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initial?: any;
  brands: { id: string; name: string }[];
  // Taxonomy tree already adapted to Record format by adaptTaxonomyTree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taxonomy: any;
}

const SIZE_SYSTEMS = ['awg', 'mm2', 'kcmil', 'none'];

export function CableForm({ initial, brands, taxonomy }: CableFormProps) {
  const router = useRouter();

  // === Basic fields ===
  const [model, setModel] = useState(initial?.model ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [brandId, setBrandId] = useState(initial?.brand_id ?? '');
  const [sizeSystem, setSizeSystem] = useState(initial?.size_system ?? 'awg');

  // === Cascade dropdowns ===
  // Parse product_type_id (e.g. "consumer_electronics/internal_wiring/electronic_wire")
  // into industry / category / productType segments for pre-fill.
  const ptSegments = (initial?.product_type_id ?? '').split('/').filter(Boolean);
  const [industry, setIndustry] = useState(ptSegments[0] ?? '');
  const [category, setCategory] = useState(ptSegments[1] ?? '');
  const [productType, setProductType] = useState(ptSegments[2] ?? '');

  const [baseDescription, setBaseDescription] = useState(initial?.base_description ?? '');
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? '');

  // === JSON editors ===
  const [commonSpecsText, setCommonSpecsText] = useState(
    JSON.stringify(initial?.common_specs ?? [], null, 2)
  );
  const [variantsText, setVariantsText] = useState(
    JSON.stringify(initial?.variants ?? [], null, 2)
  );
  const [commonSpecsValid, setCommonSpecsValid] = useState(true);
  const [variantsValid, setVariantsValid] = useState(true);
  const [commonSpecsError, setCommonSpecsError] = useState('');
  const [variantsError, setVariantsError] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // === Taxonomy cascade options ===
  const industries = Object.keys(taxonomy || {});
  const categories = industry && taxonomy?.[industry]?.categories
    ? Object.keys(taxonomy[industry].categories)
    : [];
  const productTypes = industry && category && taxonomy?.[industry]?.categories?.[category]?.product_types
    ? Object.keys(taxonomy[industry].categories[category].product_types)
    : [];

  function handleIndustryChange(value: string) {
    setIndustry(value);
    setCategory('');
    setProductType('');
  }
  function handleCategoryChange(value: string) {
    setCategory(value);
    setProductType('');
  }

  function handleCommonSpecsChange(value: string) {
    setCommonSpecsText(value);
    try {
      JSON.parse(value);
      setCommonSpecsValid(true);
      setCommonSpecsError('');
    } catch (e) {
      setCommonSpecsValid(false);
      setCommonSpecsError((e as Error).message);
    }
  }

  function handleVariantsChange(value: string) {
    setVariantsText(value);
    try {
      JSON.parse(value);
      setVariantsValid(true);
      setVariantsError('');
    } catch (e) {
      setVariantsValid(false);
      setVariantsError((e as Error).message);
    }
  }

  const formValid = commonSpecsValid && variantsValid;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setError(null);
    setSaving(true);

    const payload = {
      id: initial?.id || slug,
      brand_id: brandId,
      product_type_id: `${industry}/${category}/${productType}`,
      industry_id: industry,
      category_id: `${industry}/${category}`,
      model,
      slug,
      size_system: sizeSystem,
      base_description: baseDescription || null,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      common_specs: JSON.parse(commonSpecsText),
      variants: JSON.parse(variantsText),
    };

    try {
      const url = initial ? `/api/admin/cables/${initial.id}` : '/api/admin/cables';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/admin/cables');
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
    if (!window.confirm('Delete this cable?')) return;
    try {
      const res = await fetch(`/api/admin/cables/${initial.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        router.push('/admin/cables');
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
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-4">
      {/* === Basic Info === */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Basic Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="model" className="text-sm font-medium text-gray-700">
              Model
            </label>
            <input
              id="model"
              type="text"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
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
            <label htmlFor="brand" className="text-sm font-medium text-gray-700">
              Brand
            </label>
            <select
              id="brand"
              required
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select a brand
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sizeSystem" className="text-sm font-medium text-gray-700">
              Size System
            </label>
            <select
              id="sizeSystem"
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="industry" className="text-sm font-medium text-gray-700">
              Industry
            </label>
            <select
              id="industry"
              required
              value={industry}
              onChange={(e) => handleIndustryChange(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select an industry
              </option>
              {industries.map((i) => (
                <option key={i} value={i}>
                  {taxonomy[i]?.label || i}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="category"
              required
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={!industry}
              className={inputClass}
            >
              <option value="" disabled>
                {industry ? 'Select a category' : 'Select an industry first'}
              </option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {taxonomy[industry]?.categories?.[c]?.label || c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="productType" className="text-sm font-medium text-gray-700">
              Product Type
            </label>
            <select
              id="productType"
              required
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              disabled={!category}
              className={inputClass}
            >
              <option value="" disabled>
                {category ? 'Select a product type' : 'Select a category first'}
              </option>
              {productTypes.map((p) => (
                <option key={p} value={p}>
                  {taxonomy[industry]?.categories?.[category]?.product_types?.[p]?.label || p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="baseDescription" className="text-sm font-medium text-gray-700">
              Base Description
            </label>
            <textarea
              id="baseDescription"
              rows={3}
              value={baseDescription}
              onChange={(e) => setBaseDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="metaTitle" className="text-sm font-medium text-gray-700">
              Meta Title
            </label>
            <input
              id="metaTitle"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="metaDescription" className="text-sm font-medium text-gray-700">
              Meta Description
            </label>
            <input
              id="metaDescription"
              type="text"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4">
          <ImageFieldWithPicker
            value={imageUrl}
            onChange={setImageUrl}
          />
        </div>
      </div>

      {/* === Common Specs (JSON) === */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Common Specs (JSON)</h2>
        <p className="mb-3 text-xs text-gray-500">
          Array of spec objects: <code>{`[{ "spec_key", "label", "value_string", "value_number", "unit", "spec_type", "filterable" }]`}</code>
        </p>
        <textarea
          value={commonSpecsText}
          onChange={(e) => handleCommonSpecsChange(e.target.value)}
          className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            commonSpecsValid
              ? 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              : 'border-red-500 focus:border-red-500 focus:ring-red-500'
          }`}
        />
        {!commonSpecsValid && (
          <p className="text-red-600 text-sm mt-1">Invalid JSON: {commonSpecsError}</p>
        )}
      </div>

      {/* === Variants (JSON) === */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Variants (JSON)</h2>
        <p className="mb-3 text-xs text-gray-500">
          Array of variant objects: <code>{`[{ "slug", "specs": [{ "spec_key", "label", ... }] }]`}</code>
        </p>
        <textarea
          value={variantsText}
          onChange={(e) => handleVariantsChange(e.target.value)}
          className={`font-mono text-sm min-h-[200px] w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            variantsValid
              ? 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              : 'border-red-500 focus:border-red-500 focus:ring-red-500'
          }`}
        />
        {!variantsValid && (
          <p className="text-red-600 text-sm mt-1">Invalid JSON: {variantsError}</p>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !formValid}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/cables"
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
