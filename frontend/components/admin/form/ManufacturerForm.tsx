'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImageFieldWithPicker } from './ImageFieldWithPicker';
import type { Manufacturer } from '@/lib/types';

interface ManufacturerFormProps {
  initial?: Manufacturer;
}

export function ManufacturerForm({ initial }: ManufacturerFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = {
      id: initial?.id || slug,
      name,
      slug,
      country,
      website,
      image_url: imageUrl || null,
    };
    try {
      const url = initial
        ? `/api/admin/manufacturers/${initial.id}`
        : '/api/admin/manufacturers';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/manufacturers');
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
    if (!window.confirm('Delete this manufacturer?')) return;
    try {
      const res = await fetch(`/api/admin/manufacturers/${initial.id}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/manufacturers');
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
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <label htmlFor="country" className="text-sm font-medium text-gray-700">
          Country
        </label>
        <input
          id="country"
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="website" className="text-sm font-medium text-gray-700">
          Website
        </label>
        <input
          id="website"
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className={inputClass}
        />
      </div>
      <ImageFieldWithPicker
        value={imageUrl}
        onChange={setImageUrl}
      />

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
          href="/admin/manufacturers"
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
