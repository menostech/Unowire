'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SiteMenuItem, SiteMenuLocation, SiteMenuItemType } from '@/lib/types';

interface SiteLinkFormProps {
  initial?: SiteMenuItem;
}

export function SiteLinkForm({ initial }: SiteLinkFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? '');
  const [location, setLocation] = useState<SiteMenuLocation>(initial?.location ?? 'header');
  const [parentId, setParentId] = useState(initial?.parent_id ?? '');
  const [type, setType] = useState<SiteMenuItemType>(initial?.type ?? 'link');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [parentOptions, setParentOptions] = useState<{ id: string; label: string }[]>([]);

  // Fetch parent options on mount and whenever location changes.
  useEffect(() => {
    void fetchParents(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  async function fetchParents(loc: SiteMenuLocation) {
    try {
      const res = await fetch(`/api/admin/site-menu/tree?location=${loc}`);
      if (!res.ok) return;
      const tree: SiteMenuItem[] = await res.json();
      setParentOptions(
        tree
          .filter((item) => item.type === 'group' && item.id !== initial?.id)
          .map((item) => ({ id: item.id, label: item.label }))
      );
    } catch {
      // ignore — parent select will be empty
    }
  }

  async function handleLocationChange(newLocation: SiteMenuLocation) {
    setLocation(newLocation);
    setParentId(''); // clear parent when location changes; useEffect will refresh options
  }

  function handleTypeChange(newType: SiteMenuItemType) {
    setType(newType);
    if (newType === 'group') setUrl('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body: Record<string, unknown> = {
      id,
      location,
      parent_id: parentId || null,
      type,
      label,
      url: type === 'link' ? url : null,
      sort_order: Number(sortOrder),
      is_visible: isVisible,
    };

    try {
      const reqUrl = initial
        ? `/api/admin/site-menu/${encodeURIComponent(initial.id)}`
        : '/api/admin/site-menu';
      const method = initial ? 'PUT' : 'POST';
      if (initial) delete body.id;
      const res = await fetch(reqUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/site-menu');
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
    if (!confirm(`Delete "${initial.label}"? Child items will be cascade-deleted.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-menu/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/site-menu');
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Delete failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  async function handleSort(direction: 'up' | 'down') {
    if (!initial) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-menu/${encodeURIComponent(initial.id)}/sort`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.message || `Sort failed (status ${res.status})`);
    } catch {
      setError('Network error, try again');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {initial ? `Edit: ${initial.label}` : 'New Menu Item'}
        </h1>
        <div className="flex gap-2">
          <Link
            href="/admin/site-menu"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
          {initial && (
            <>
              <button
                type="button"
                onClick={() => handleSort('up')}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ↑ Up
              </button>
              <button
                type="button"
                onClick={() => handleSort('down')}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ↓ Down
              </button>
            </>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!initial && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
              placeholder="e.g. header-about"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Unique business ID (kebab-case recommended).
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <div className="flex gap-4">
            {(['header', 'footer'] as const).map((loc) => (
              <label key={loc} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="location"
                  value={loc}
                  checked={location === loc}
                  onChange={() => handleLocationChange(loc)}
                />
                <span className="capitalize">{loc}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-4">
            {(['link', 'group'] as const).map((t) => (
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

        {type === 'link' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="text"
              value={url ?? ''}
              onChange={(e) => setUrl(e.target.value)}
              required={type === 'link'}
              maxLength={500}
              placeholder="/about-us or https://example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal paths start with /; external links start with http(s)://.
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parent (optional)</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— None (top level) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.id})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Only group-type items in the same location can be parents.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visible</label>
            <label className="flex items-center gap-2 h-[42px]">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
              />
              <span className="text-sm">Show on site</span>
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {initial && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
