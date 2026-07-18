import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

const PAGE_SIZE = 20;

export default async function AdminPagesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const statusFilter = sp.status && ['draft', 'published'].includes(sp.status) ? sp.status : undefined;
  const { items, total } = await adminApi.pages.all(page, PAGE_SIZE, statusFilter);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusTabs = [
    { label: 'All', value: '' },
    { label: 'Drafts', value: 'draft' },
    { label: 'Published', value: 'published' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
        <Link
          href="/admin/pages/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New Page
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2">
        {statusTabs.map((tab) => {
          const isActive = (tab.value || '') === (statusFilter || '');
          const href = tab.value ? `/admin/pages?status=${tab.value}` : '/admin/pages';
          return (
            <Link
              key={tab.value || 'all'}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Visible</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{p.title}</td>
                <td className="px-4 py-3 text-gray-600">/{p.slug}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      p.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.is_visible ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.sort_order}</td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(p.updated_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/pages/${p.id}`}
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
                  No pages found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link
            href={`/admin/pages?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
            className="text-blue-600 hover:underline"
          >
            ← Prev
          </Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={`/admin/pages?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ''}`}
            className="text-blue-600 hover:underline"
          >
            Next →
          </Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
