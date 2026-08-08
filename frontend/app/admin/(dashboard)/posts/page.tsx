import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    category_id?: string;
    q?: string;
    status?: string;
  }>;
}

const PAGE_SIZE = 20;

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return value;
  }
}

export default async function PostsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const categoryId = sp.category_id;
  const q = sp.q;
  const status = sp.status;

  const [postsResult, categories] = await Promise.all([
    adminApi.posts.all(page, PAGE_SIZE, {
      category_id: categoryId,
      q,
      status,
    }),
    adminApi.postCategories.all(),
  ]);

  const { items, total } = postsResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(p: number): string {
    const params = new URLSearchParams({ page: String(p) });
    if (categoryId) params.set('category_id', categoryId);
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    return `/admin/posts?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Posts</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/posts/categories"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Categories
          </Link>
          <Link
            href="/admin/posts/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New Post
          </Link>
        </div>
      </div>

      {/* Filter form (GET) */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-gray-600">
            Keyword
          </label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ''}
            placeholder="Search title…"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category_id" className="text-gray-600">
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={categoryId ?? ''}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-gray-600">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Filter
        </button>
        {(categoryId || q || status) && (
          <Link
            href="/admin/posts"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Visible</th>
              <th className="px-4 py-3 font-medium">Published Date</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{p.title}</td>
                <td className="px-4 py-3 text-gray-600">{p.category?.label ?? '—'}</td>
                <td className="px-4 py-3">
                  {p.status === 'published' ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Published
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Draft
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.is_visible ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(p.published_at)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/posts/${encodeURIComponent(p.id)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No posts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className="text-accent-foreground hover:underline">
            ← Prev
          </Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1)} className="text-accent-foreground hover:underline">
            Next →
          </Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
