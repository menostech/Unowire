import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    category_id?: string;
    q?: string;
    scope_type?: string;
    scope_id?: string;
  }>;
}

const PAGE_SIZE = 20;

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatScope(scopeType: string | null, scopeId: string | null): string {
  if (!scopeType) return 'Global';
  return scopeId ? `${scopeType} / ${scopeId}` : scopeType;
}

export default async function ResourcesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const categoryId = sp.category_id;
  const q = sp.q;
  const scopeType = sp.scope_type;
  const scopeId = sp.scope_id;

  const [resourcesResult, categoryTree] = await Promise.all([
    adminApi.resources.all(page, PAGE_SIZE, {
      category_id: categoryId,
      q,
      scope_type: scopeType,
      scope_id: scopeId,
    }),
    adminApi.resourceCategories.all(),
  ]);

  const { items, total } = resourcesResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Flatten category tree for dropdown: top-level + children with parent_label prefix.
  const flatCategories = categoryTree.flatMap((parent) => {
    const self = {
      id: parent.id,
      label: parent.label,
      parent_id: null as string | null,
      parent_label: null as string | null,
    };
    const children = (parent.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
      parent_id: parent.id,
      parent_label: parent.label,
    }));
    return [self, ...children];
  });

  // Preserve selected filter values; rebuild query string for pagination links.
  function buildPageHref(p: number): string {
    const params = new URLSearchParams({ page: String(p) });
    if (categoryId) params.set('category_id', categoryId);
    if (q) params.set('q', q);
    if (scopeType) params.set('scope_type', scopeType);
    if (scopeId) params.set('scope_id', scopeId);
    return `/admin/resources?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/resources/categories"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Categories
          </Link>
          <Link
            href="/admin/resources/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New Resource
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
            placeholder="Search title or description…"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All categories</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_label ? `${c.parent_label} — ${c.label}` : c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="scope_type" className="text-gray-600">
            Scope
          </label>
          <select
            id="scope_type"
            name="scope_type"
            defaultValue={scopeType ?? ''}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All scopes</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="equipment_manufacturer">Equipment Manufacturer</option>
            <option value="terminal_manufacturer">Terminal Manufacturer</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Filter
        </button>
        {(categoryId || q || scopeType) && (
          <Link
            href="/admin/resources"
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
              <th className="px-4 py-3 font-medium">Scope</th>
              <th className="px-4 py-3 font-medium">File Size</th>
              <th className="px-4 py-3 font-medium">Downloads</th>
              <th className="px-4 py-3 font-medium">Published</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{r.title}</td>
                <td className="px-4 py-3 text-gray-600">{r.category?.label ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatScope(r.scope_type, r.scope_id)}</td>
                <td className="px-4 py-3 text-gray-600">{formatFileSize(r.file_size_bytes)}</td>
                <td className="px-4 py-3 text-gray-600">{r.download_count}</td>
                <td className="px-4 py-3">
                  {r.is_published ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/resources/${encodeURIComponent(r.id)}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No resources found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className="text-blue-600 hover:underline">
            ← Prev
          </Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1)} className="text-blue-600 hover:underline">
            Next →
          </Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
