'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface IndustryOption {
  id: string;
  label: string;
}

interface CategoryFormProps {
  initial?: {
    id: string;
    industry_id: string;
    label: string;
    slug: string;
    description: string | null;
    sort_order: number;
    image_url: string | null;
  };
  industries: IndustryOption[];
  // Pre-selected industry when creating new category via ?industry_id= query
  preselectIndustryId?: string;
}

export function CategoryForm({ initial, industries, preselectIndustryId }: CategoryFormProps) {
  const router = useRouter();
  const [industryId, setIndustryId] = useState(initial?.industry_id ?? preselectIndustryId ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Composite ID: "industry_id/category_slug"
    const compositeId = initial?.id || `${industryId}/${slug}`;
    const body = {
      id: compositeId,
      industry_id: industryId,
      label,
      slug,
      description: description || null,
      sort_order: Number(sortOrder),
      image_url: imageUrl || null,
    };
    try {
      const url = initial
        ? `/api/admin/categories/${encodeURIComponent(compositeId)}`
        : '/api/admin/categories';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/taxonomy/categories');
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
    if (!window.confirm('Delete this category? If it has cables referencing it, deletion will be blocked.')) return;
    try {
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/taxonomy/categories');
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="industry_id" className="text-sm font-medium text-gray-700">
          Industry
        </label>
        <select
          id="industry_id"
          required
          value={industryId}
          onChange={(e) => setIndustryId(e.target.value)}
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
        {initial && (
          <p className="text-xs text-gray-500">
            Industry cannot be changed after creation (would require changing the composite ID)
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
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <Link
          href="/admin/taxonomy/categories"
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
