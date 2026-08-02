'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BackendResource } from '@/lib/adminApi';

interface ResourceFormProps {
  initial?: BackendResource;
  categories: { id: string; label: string; parent_id: string | null; parent_label?: string | null }[];
}

const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg';

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ResourceForm({ initial, categories }: ResourceFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState(initial?.id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url ?? '');
  const [scopeType, setScopeType] = useState(initial?.scope_type ?? '');
  const [scopeId, setScopeId] = useState(initial?.scope_id ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Create mode: require either a file or an external_url.
    if (!initial) {
      const hasFile = fileRef.current?.files?.[0];
      if (!hasFile && !externalUrl.trim()) {
        setError('Either a file or an external URL is required.');
        return;
      }
    }

    setSaving(true);
    const formData = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) {
      formData.append('file', file);
    }
    if (!initial) {
      formData.append('id', id);
    }
    formData.append('title', title);
    formData.append('slug', slug);
    formData.append('category_id', categoryId);
    formData.append('description', description);
    formData.append('external_url', externalUrl);
    formData.append('thumbnail_url', thumbnailUrl);
    formData.append('sort_order', String(sortOrder));
    formData.append('is_published', isPublished ? 'true' : 'false');
    if (scopeType) formData.append('scope_type', scopeType);
    if (scopeId) formData.append('scope_id', scopeId);

    try {
      const url = initial
        ? `/api/admin/resources/${encodeURIComponent(initial.id)}`
        : '/api/admin/resources';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        body: formData,
      });
      if (res.ok) {
        router.push('/admin/resources');
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
    if (!window.confirm('Delete this resource?')) return;
    try {
      const res = await fetch(`/api/admin/resources/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/resources');
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
    <form onSubmit={handleSubmit} encType="multipart/form-data" className="max-w-2xl space-y-4">
      {!initial && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="id" className="text-sm font-medium text-gray-700">
            ID
          </label>
          <input
            id="id"
            type="text"
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="file" className="text-sm font-medium text-gray-700">
          File
          {initial && (
            <span className="font-normal text-gray-400"> (optional — leave empty to keep current)</span>
          )}
        </label>
        <input
          id="file"
          name="file"
          type="file"
          ref={fileRef}
          accept={ACCEPTED_FILE_TYPES}
          className="text-sm"
        />
        {initial && (
          <p className="text-xs text-gray-500">
            Current file: {initial.file_filename ?? '—'} ({formatFileSize(initial.file_size_bytes)})
            {initial.download_count > 0 && ` · ${initial.download_count} downloads`}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          onBlur={() => {
            if (!slug && title) setSlug(generateSlug(title));
          }}
          className={inputClass}
        />
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
        <label htmlFor="thumbnail_url" className="text-sm font-medium text-gray-700">
          Thumbnail URL
        </label>
        <input
          id="thumbnail_url"
          type="text"
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="scope_type" className="text-sm font-medium text-gray-700">
          Scope Type <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="scope_type"
          type="text"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value)}
          placeholder="manufacturer / equipment_manufacturer / terminal_manufacturer"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="scope_id" className="text-sm font-medium text-gray-700">
          Scope ID <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          id="scope_id"
          type="text"
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
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
      <div className="flex items-center gap-2">
        <input
          id="is_published"
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="is_published" className="text-sm font-medium text-gray-700">
          Published
        </label>
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
          href="/admin/resources"
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
