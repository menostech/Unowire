'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';

interface EquipmentFormProps {
  initial?: {
    id: string;
    manufacturer_id: string;
    category_id: string;
    model: string;
    slug: string;
    applicable_specs: unknown[];
    description: string | null;
    image_url: string | null;
    external_url: string | null;
    sort_order: number;
  };
  manufacturers: { id: string; name: string }[];
  categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[];
}

export function EquipmentForm({ initial, manufacturers, categories }: EquipmentFormProps) {
  const router = useRouter();
  const [manufacturerId, setManufacturerId] = useState(initial?.manufacturer_id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [applicableSpecsText, setApplicableSpecsText] = useState(
    JSON.stringify(initial?.applicable_specs ?? [], null, 2)
  );
  const [applicableSpecsValid, setApplicableSpecsValid] = useState(true);
  const [applicableSpecsError, setApplicableSpecsError] = useState('');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Build two-level indented category options: top-level first, then their children indented.
  const topLevel = categories.filter((c) => !c.parent_id);
  const childrenByParent = new Map<string, typeof categories>();
  for (const c of categories) {
    if (c.parent_id) {
      const arr = childrenByParent.get(c.parent_id) ?? [];
      arr.push(c);
      childrenByParent.set(c.parent_id, arr);
    }
  }

  function handleApplicableSpecsChange(value: string) {
    setApplicableSpecsText(value);
    try {
      JSON.parse(value);
      setApplicableSpecsValid(true);
      setApplicableSpecsError('');
    } catch (e) {
      setApplicableSpecsValid(false);
      setApplicableSpecsError((e as Error).message);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!applicableSpecsValid) return;
    setError(null);
    setSaving(true);
    const body = {
      id: initial?.id || slug,
      manufacturer_id: manufacturerId,
      category_id: categoryId,
      model,
      slug,
      applicable_specs: JSON.parse(applicableSpecsText),
      description: description || null,
      image_url: imageUrl || null,
      external_url: externalUrl || null,
      sort_order: Number(sortOrder),
    };
    try {
      const url = initial
        ? `/api/admin/equipment/${encodeURIComponent(initial.id)}`
        : '/api/admin/equipment';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/equipment');
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
    if (!window.confirm('Delete this equipment?')) return;
    try {
      const res = await fetch(`/api/admin/equipment/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/equipment');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  const inputClass =
    'rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground';

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="manufacturer_id" className="text-sm font-medium text-gray-700">
          Manufacturer
        </label>
        <select
          id="manufacturer_id"
          required
          value={manufacturerId}
          onChange={(e) => setManufacturerId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a manufacturer…</option>
          {manufacturers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category_id" className="text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          id="category_id"
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a category…</option>
          {topLevel.map((parent) => (
            <optgroup key={parent.id} label={parent.label}>
              <option value={parent.id}>{parent.label}</option>
              {(childrenByParent.get(parent.id) ?? []).map((child) => (
                <option key={child.id} value={child.id}>
                  — {child.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
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
        <label htmlFor="applicable_specs" className="text-sm font-medium text-gray-700">
          Applicable Specs (JSON)
        </label>
        <textarea
          id="applicable_specs"
          rows={6}
          value={applicableSpecsText}
          onChange={(e) => handleApplicableSpecsChange(e.target.value)}
          placeholder='[{"spec_key":"conductor_area","min":0.1,"max":1.0}]'
          className={`font-mono text-sm w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-1 ${
            applicableSpecsValid
              ? 'border-gray-300 focus:border-accent-foreground focus:ring-accent-foreground'
              : 'border-red-500 focus:border-red-500 focus:ring-red-500'
          }`}
        />
        {!applicableSpecsValid && (
          <p className="text-red-600 text-sm">Invalid JSON: {applicableSpecsError}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="external_url" className="text-sm font-medium text-gray-700">
          External URL
        </label>
        <input
          id="external_url"
          type="text"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          className={inputClass}
        />
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

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/equipment"
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
