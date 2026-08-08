'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BackendPost } from '@/lib/adminApi';
import { ImageFieldWithPicker } from '@/components/admin/form/ImageFieldWithPicker';
import { MediaPickerModal } from '@/components/admin/form/MediaPickerModal';

interface PostFormProps {
  initial?: BackendPost;
  categories: { id: string; label: string }[];
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function PostForm({ initial, categories }: PostFormProps) {
  const router = useRouter();
  const [id, setId] = useState(initial?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.cover_image_url ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? '');
  const [ogImageUrl, setOgImageUrl] = useState(initial?.og_image_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body: Record<string, unknown> = {
      title,
      slug,
      category_id: categoryId,
      content,
      excerpt: excerpt || null,
      cover_image_url: coverImageUrl || null,
      status,
      is_visible: isVisible,
      sort_order: Number(sortOrder),
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      og_image_url: ogImageUrl || null,
    };
    if (!initial) {
      body.id = id;
    }
    try {
      const url = initial
        ? `/api/admin/posts/${encodeURIComponent(initial.id)}`
        : '/api/admin/posts';
      const method = initial ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/admin/posts');
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
    if (!window.confirm('Delete this post?')) return;
    try {
      const res = await fetch(`/api/admin/posts/${encodeURIComponent(initial.id)}`, {
        method: 'DELETE',
      });
      if (res.ok || res.status === 204) {
        router.push('/admin/posts');
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
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="content" className="text-sm font-medium text-gray-700">
            Content (Markdown)
          </label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-3 py-1.5 text-sm font-medium text-accent-foreground bg-accent border border-accent-foreground/30 rounded-md hover:bg-accent transition-colors"
          >
            Insert Image
          </button>
        </div>
        <textarea
          id="content"
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`${inputClass} font-mono`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="excerpt" className="text-sm font-medium text-gray-700">
          Excerpt
        </label>
        <textarea
          id="excerpt"
          rows={2}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className={inputClass}
        />
      </div>
      <ImageFieldWithPicker label="Cover Image URL" value={coverImageUrl} onChange={setCoverImageUrl} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="status" className="text-sm font-medium text-gray-700">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputClass}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="is_visible"
          type="checkbox"
          checked={isVisible}
          onChange={(e) => setIsVisible(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="is_visible" className="text-sm font-medium text-gray-700">
          Visible
        </label>
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

      <fieldset className="rounded-md border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-700">SEO Settings</legend>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="meta_title" className="text-sm font-medium text-gray-700">
              Meta Title
            </label>
            <input
              id="meta_title"
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="meta_description" className="text-sm font-medium text-gray-700">
              Meta Description
            </label>
            <textarea
              id="meta_description"
              rows={2}
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          <ImageFieldWithPicker label="OG Image URL" value={ogImageUrl} onChange={setOgImageUrl} />
        </div>
      </fieldset>

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
          href="/admin/posts"
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
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          setContent(content + '\n\n![image](' + url + ')\n');
          setPickerOpen(false);
        }}
      />
    </form>
  );
}
