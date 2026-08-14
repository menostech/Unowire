import Link from 'next/link';
import { Suspense } from 'react';
import { adminApi } from '@/lib/adminApi';
import { TerminalSearchBox } from '@/components/admin/list/TerminalSearchBox';

interface PageProps {
  searchParams: Promise<{ page?: string; manufacturer_id?: string; category_id?: string; q?: string }>;
}

const PAGE_SIZE = 20;

export default async function TerminalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const manufacturerId = sp.manufacturer_id;
  const categoryId = sp.category_id;
  const q = sp.q;

  const [terminalsResult, manufacturersResult, categoryTree] = await Promise.all([
    adminApi.terminals.all(page, PAGE_SIZE, {
      manufacturer_id: manufacturerId,
      category_id: categoryId,
      q,
    }),
    adminApi.terminalManufacturers.all(1, 999),
    adminApi.terminalCategories.all(),
  ]);

  const { items, total } = terminalsResult;
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
    if (manufacturerId) params.set('manufacturer_id', manufacturerId);
    if (categoryId) params.set('category_id', categoryId);
    if (q) params.set('q', q);
    return `/admin/connectivity?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Connectivity</h1>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <TerminalSearchBox />
          </Suspense>
          <Link
            href="/admin/connectivity/import"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/admin/connectivity/new"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            New
          </Link>
        </div>
      </div>

      {/* Filter form (GET) */}
      <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="manufacturer_id" className="text-gray-600">
            Manufacturer
          </label>
          <select
            id="manufacturer_id"
            name="manufacturer_id"
            defaultValue={manufacturerId ?? ''}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-foreground focus:outline-none focus:ring-1 focus:ring-accent-foreground"
          >
            <option value="">All manufacturers</option>
            {manufacturersResult.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
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
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_label ? `${c.parent_label} — ${c.label}` : c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Filter
        </button>
        {(manufacturerId || categoryId) && (
          <Link
            href="/admin/connectivity"
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
              <th className="px-4 py-3 font-medium">Image</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Manufacturer</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {t.image_url ? (
                    <img src={t.image_url} alt={t.model} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200" />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-900">{t.model}</td>
                <td className="px-4 py-3 text-gray-600">{t.manufacturer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{t.category?.label ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/connectivity/${encodeURIComponent(t.id)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No connectivity products found.
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

