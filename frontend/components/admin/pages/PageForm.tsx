'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MediaPickerModal } from '@/components/admin/form/MediaPickerModal';
import { MarkdownToolbar } from './MarkdownToolbar';
import { PageView } from '@/components/pages/PageView';
import { validateSlug, slugify } from '@/lib/validation/pages';
import type { Page } from '@/lib/types';

interface PageFormProps {
  initial?: Page;
}

type SaveMode = 'draft' | 'publish';

export function PageForm({ initial }: PageFormProps) {
  const router = useRouter();
  const [id] = useState(initial?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [content, setContent] = useState(initial?.content ?? '');
  const [status, setStatus] = useState<Page['status']>(initial?.status ?? 'draft');
  const [isVisible, setIsVisible] = useState(initial?.is_visible ?? true);
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [metaTitle, setMetaTitle] = useState(initial?.meta_title ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.meta_description ?? '');
  const [ogImageUrl, setOgImageUrl] = useState(initial?.og_image_url ?? '');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const slugError = slug ? validateSlug(slug) : null;

  function handleTitleBlur() {
    if (!slugTouched && title) {
      setSlug(slugify(title));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugTouched(true);
  }

  function handleInsertImage(urlPath: string) {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = content;
    const alt = 'image';
    const markdown = `![${alt}](${urlPath})`;
    const newValue = value.slice(0, start) + markdown + value.slice(end);
    setContent(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursor = start + markdown.length;
      textarea.setSelectionRange(newCursor, newCursor);
    });
  }

  function handlePickOgImage() {
    setMediaPickerOpen(true);
  }

  async function handleSubmit(mode: SaveMode) {
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }
    if (slugError) {
      setError(slugError);
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      title,
      slug,
      content,
      status: mode === 'publish' ? 'published' : 'draft',
      is_visible: isVisible,
      sort_order: sortOrder,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      og_image_url: ogImageUrl || null,
    };
    try {
      if (initial) {
        const res = await fetch(`/api/admin/pages/${initial.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Save failed (${res.status})`);
        }
      } else {
        body.id = slug; // use slug as id for new pages (admin can edit later if needed)
        const res = await fetch('/api/admin/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Save failed (${res.status})`);
        }
      }
      router.push('/admin/pages');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!window.confirm('Delete this page? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/pages/${initial.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Delete failed (${res.status})`);
      }
      router.push('/admin/pages');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {initial ? 'Edit Page' : 'New Page'}
        </h1>
        <Link href="/admin/pages" className="text-sm text-gray-600 hover:underline">
          ← Back to list
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column: title + editor */}
        <div className="space-y-4 lg:col-span-2">
          <div>
            <label className={labelClass} htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className={inputClass}
              placeholder="Page title"
            />
          </div>

          <div>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTab('write')}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  tab === 'write' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`rounded-md px-3 py-1 text-sm font-medium ${
                  tab === 'preview' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Preview
              </button>
            </div>

            {tab === 'write' ? (
              <div className="overflow-hidden rounded-md border border-gray-300">
                <MarkdownToolbar
                  textareaRef={textareaRef}
                  value={content}
                  onChange={setContent}
                  onInsertImage={() => setMediaPickerOpen(true)}
                />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="block w-full min-h-[400px] resize-y border-0 p-3 font-mono text-sm focus:outline-none focus:ring-0"
                  placeholder="Write Markdown here..."
                />
              </div>
            ) : (
              <div className="rounded-md border border-gray-300 bg-white p-4">
                {content.trim() ? (
                  <PageView page={{ slug, title, content, meta_title: null, meta_description: null, og_image_url: null }} />
                ) : (
                  <p className="text-gray-400">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: slug, status, visibility, SEO */}
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="slug">Slug</label>
            <div className="flex items-center">
              <span className="rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-2 py-2 text-sm text-gray-500">/</span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="w-full rounded-r-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
                placeholder="about-us"
              />
            </div>
            {slugError && (
              <p className="mt-1 text-xs text-red-600">{slugError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Public URL: /{slug || '...'}
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="status">Status</label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Page['status'])}
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
            <label htmlFor="is_visible" className="text-sm text-gray-700">
              Visible on site (hidden = admin-only preview)
            </label>
          </div>

          <div>
            <label className={labelClass} htmlFor="sort_order">Sort Order</label>
            <input
              id="sort_order"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value || '0', 10))}
              className={inputClass}
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">SEO</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="meta_title">Meta Title</label>
                <input
                  id="meta_title"
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  className={inputClass}
                  placeholder="SEO title (optional)"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="meta_description">Meta Description</label>
                <textarea
                  id="meta_description"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  className={inputClass}
                  rows={3}
                  placeholder="SEO description (optional)"
                />
              </div>
              <div>
                <label className={labelClass}>OG Image</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ogImageUrl}
                    onChange={(e) => setOgImageUrl(e.target.value)}
                    className={inputClass}
                    placeholder="/media/uploads/..."
                  />
                  <button
                    type="button"
                    onClick={handlePickOgImage}
                    className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Pick
                  </button>
                </div>
                {ogImageUrl && (
                  <img src={ogImageUrl} alt="OG preview" className="mt-2 h-20 w-auto rounded border border-gray-200" />
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-500">
              To add this page to the site menu, go to{' '}
              <Link href="/admin/menu" className="text-accent-foreground hover:underline">Menu → New Item</Link>
              , choose type=link, and set URL to <code className="rounded bg-gray-100 px-1">/{slug || '...'}</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Save buttons */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        {initial && (
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            disabled={saving}
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); handleSubmit('draft'); }}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={saving || Boolean(slugError)}
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); handleSubmit('publish'); }}
          className="rounded-md bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95"
          disabled={saving || Boolean(slugError)}
        >
          Save and Publish
        </button>
      </div>

      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(urlPath) => {
          // Distinguish: if user came from OG image pick (input was focused),
          // vs from Markdown toolbar image insert.
          // For simplicity, always insert into content. User can copy URL to OG field manually.
          handleInsertImage(urlPath);
        }}
      />
    </div>
  );
}
