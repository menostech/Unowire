import Link from 'next/link';
import { Suspense } from 'react';
import { adminApi } from '@/lib/adminApi';
import { CableSearchBox } from '@/components/admin/list/CableSearchBox';

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

const PAGE_SIZE = 20;

export default async function CablesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const q = sp.q;
  const { items, total } = await adminApi.cables.all(page, PAGE_SIZE, q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserve ?q= across pagination links
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(n));
    return `/admin/cables?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Cables</h1>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <CableSearchBox />
          </Suspense>
          <Link
            href="/admin/cables/import"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/admin/cables/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Manufacturer</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Product Type</th>
              <th className="px-4 py-3 font-medium">Size System</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{c.model}</td>
                <td className="px-4 py-3 text-gray-600">
                  {c.manufacturer?.name || c.manufacturer_id || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c.category_id?.split('/').pop() || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c.product_type_id?.split('/').pop() || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.size_system || '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/cables/${c.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No cables found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className="text-blue-600 hover:underline">
            ← Prev
          </Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={pageHref(page + 1)} className="text-blue-600 hover:underline">
            Next →
          </Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
