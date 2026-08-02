import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Pagination } from '@/components/shared/Pagination';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resources | Unowire',
  description: 'Browse technical documents, datasheets, and resources. Filter by category or search by keyword.',
};

const PAGE_SIZE = 12;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category_id?: string;
    page?: string;
    [key: string]: string | undefined;
  }>;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(filename: string | null | undefined): string {
  if (!filename) return 'FILE';
  const parts = filename.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].toUpperCase();
}

export default async function ResourcesListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Number(sp.page ?? '1') || 1;
  const categoryId = sp.category_id ?? '';
  const q = sp.q ?? '';

  // Load category tree (sidebar nav) and paginated resources in parallel.
  const [categoryTree, resourcesResponse] = await Promise.all([
    api.resourceCategories.tree(),
    api.resources.all({
      page,
      page_size: PAGE_SIZE,
      category_id: categoryId || undefined,
      q: q || undefined,
    }),
  ]);

  const items = resourcesResponse.items ?? [];
  const total = resourcesResponse.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Resources' }]} />
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Resources</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Category navigation sidebar */}
        <aside className="lg:col-span-1">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">Categories</h2>
            <nav className="space-y-1">
              <Link
                href="/resources"
                className={`block rounded-md px-3 py-2 text-sm transition ${
                  !categoryId
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                All Resources
              </Link>
              {categoryTree.map((parent) => {
                const parentActive = categoryId === parent.id;
                return (
                  <div key={parent.id}>
                    <Link
                      href={`/resources?category_id=${encodeURIComponent(parent.id)}`}
                      className={`block rounded-md px-3 py-2 text-sm transition ${
                        parentActive
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {parent.label}
                    </Link>
                    {(parent.children ?? []).map((child) => {
                      const childActive = categoryId === child.id;
                      return (
                        <Link
                          key={child.id}
                          href={`/resources?category_id=${encodeURIComponent(child.id)}`}
                          className={`block rounded-md py-2 pl-6 pr-3 text-sm transition ${
                            childActive
                              ? 'bg-blue-50 font-medium text-blue-700'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content: search + list */}
        <div className="lg:col-span-3">
          {/* Search box */}
          <form action="/resources" method="get" className="mb-6">
            <div className="flex items-center gap-2">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Search resources…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Search
              </button>
            </div>
          </form>

          {/* List */}
          {items.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <p className="text-gray-500">No resources found.</p>
              {(q || categoryId) && (
                <Link
                  href="/resources"
                  className="mt-3 inline-block text-sm text-blue-600 hover:underline"
                >
                  Clear filters
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-500">
                {total} resource{total !== 1 ? 's' : ''} found
              </p>
              <div className="space-y-3">
                {items.map((resource) => (
                  <Link
                    key={resource.id}
                    href={`/resources/${encodeURIComponent(resource.slug)}`}
                    className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
                  >
                    {/* File type icon */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-600">
                      {fileExtension(resource.file_filename)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
                        {resource.title}
                      </h3>
                      {resource.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                          {resource.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        {resource.category && (
                          <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                            {resource.category.label}
                          </span>
                        )}
                        {resource.file_size_bytes !== null && (
                          <span>{formatFileSize(resource.file_size_bytes)}</span>
                        )}
                        {resource.download_count > 0 && (
                          <span>{resource.download_count} download{resource.download_count !== 1 ? 's' : ''}</span>
                        )}
                        {resource.external_url && !resource.file_filename && (
                          <span className="text-blue-600">External link →</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                basePath="/resources"
                searchParams={{ q, category_id: categoryId }}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
