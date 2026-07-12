'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { IconPicker } from './IconPicker';
import { ADMIN_PAGES } from '@/lib/adminMenuRegistry';
import type { MenuItem, MenuItemType } from '@/lib/types';

interface MenuItemFormProps {
  initial?: MenuItem;
  parentOptions: { id: string; label: string }[];
}

export function MenuItemForm({ initial, parentOptions }: MenuItemFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? '');
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');
  const [type, setType] = useState<MenuItemType>(initial?.type ?? 'page');
  const [pageId, setPageId] = useState(initial?.page_id ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleTypeChange(newType: MenuItemType) {
    setType(newType);
    // Clear opposite-type fields.
    if (newType === 'page') setUrl('');
    if (newType === 'link') setPageId('');
    if (newType === 'group') {
      setPageId('');
      setUrl('');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Always send page_id and url (null for the unused one) so the backend's
    // exclude_unset=True merge picks up explicit nulls and clears stale DB
    // values when the type is switched (e.g. page -> link).
    const body: Record<string, unknown> = {
      id,
      parent_id: parentId || null,
      type,
      label,
      icon,
      sort_order: Number(sortOrder),
      is_visible: isVisible,
      page_id: type === 'page' ? pageId : null,
      url: type === 'link' ? url : null,
    };

    try {
      const reqUrl = initial
        ? `/api/admin/menu/${encodeURIComponent(initial.id)}`
        : '/api/admin/menu';
      const method = initial ? 'PUT' : 'POST';
      // For PUT, do not include `id` in body (it's immutable).
      if (initial) delete body.id;
      const res = await fetch(reqUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/menu');
        router.refresh();
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
    if (!window.confirm('Delete this menu item?')) return;
    try {
      const res = await fetch(`/api/admin/menu/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/menu');
        router.refresh();
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
      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Type</label>
        <div className="flex gap-4">
          {(['page', 'link', 'group'] as MenuItemType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => handleTypeChange(t)}
              />
              <span className="capitalize">{t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ID */}
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
          disabled={!!initial}
          className={inputClass}
        />
        {initial && (
          <p className="text-xs text-gray-500">ID cannot be changed after creation.</p>
        )}
      </div>

      {/* Label */}
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

      {/* Parent */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="parent_id" className="text-sm font-medium text-gray-700">
          Parent
        </label>
        <select
          id="parent_id"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={inputClass}
        >
          <option value="">None (Top Level)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Page selector (type=page) */}
      {type === 'page' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="page_id" className="text-sm font-medium text-gray-700">
            Page
          </label>
          <select
            id="page_id"
            required
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a page...</option>
            {ADMIN_PAGES.map((p) => (
              <option key={p.pageId} value={p.pageId}>
                {p.defaultLabel} ({p.href})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* URL (type=link) */}
      {type === 'link' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="url" className="text-sm font-medium text-gray-700">
            URL
          </label>
          <input
            id="url"
            type="text"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/admin/custom or https://example.com"
            className={inputClass}
          />
        </div>
      )}

      {/* Icon */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-700">Icon</label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {/* Sort Order */}
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

      {/* Visible */}
      <div className="flex items-center gap-2">
        <input
          id="is_visible"
          type="checkbox"
          checked={isVisible}
          onChange={(e) => setIsVisible(e.target.checked)}
        />
        <label htmlFor="is_visible" className="text-sm font-medium text-gray-700">
          Visible in sidebar
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
          href="/admin/menu"
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
