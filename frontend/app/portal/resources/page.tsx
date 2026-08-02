import { Suspense } from 'react';
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import { ResourceListToolbar } from '@/components/portal/resources/ResourceListToolbar';
import { ResourceDeleteButton } from '@/components/portal/form/ResourceDeleteButton';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ search?: string; category_id?: string; page?: string }>;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PortalResourcesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  let resources: Awaited<ReturnType<typeof portalApi.resources.all>>['items'] = [];
  let total = 0;
  try {
    const result = await portalApi.resources.all({
      search: sp.search,
      category_id: sp.category_id,
      page,
      page_size: PAGE_SIZE,
    });
    resources = result.items;
    total = result.total;
  } catch {
    // empty state
  }

  // Fetch categories for the toolbar dropdown (flatten 2-level tree).
  let categories: { id: string; label: string; parent_label?: string | null }[] = [];
  try {
    const tree = await portalApi.resourceCategories.all();
    categories = tree.flatMap((parent) => {
      const self = { id: parent.id, label: parent.label, parent_label: null as string | null };
      const children = (parent.children ?? []).map((child) => ({
        id: child.id,
        label: child.label,
        parent_label: parent.label,
      }));
      return [self, ...children];
    });
  } catch {
    // empty categories
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(p: number): string {
    const params = new URLSearchParams({ page: String(p) });
    if (sp.search) params.set('search', sp.search);
    if (sp.category_id) params.set('category_id', sp.category_id);
    return `/portal/resources?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <Link
          href="/portal/resources/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Resource
        </Link>
      </div>

      <Suspense fallback={null}>
        <ResourceListToolbar categories={categories} />
      </Suspense>

      {resources.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No resources in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Downloads</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resources.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{r.title || r.id}</td>
                  <td className="px-4 py-3 text-gray-600">{r.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatFileSize(r.file_size_bytes)}</td>
                  <td className="px-4 py-3 text-gray-500">{r.download_count}</td>
                  <td className="px-4 py-3">
                    {r.is_published ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Published
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 flex items-center gap-3">
                    <Link href={`/portal/resources/${r.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <ResourceDeleteButton resourceId={r.id} resourceTitle={r.title || r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className="text-blue-600 hover:underline">← Prev</Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1)} className="text-blue-600 hover:underline">Next →</Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
