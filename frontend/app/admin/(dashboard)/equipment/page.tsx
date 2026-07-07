import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ page?: string; manufacturer_id?: string; category_id?: string }>;
}

const PAGE_SIZE = 20;

export default async function EquipmentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const manufacturerId = sp.manufacturer_id;
  const categoryId = sp.category_id;

  const [equipmentResult, manufacturersResult, categoryTree] = await Promise.all([
    adminApi.equipment.all(page, PAGE_SIZE, {
      manufacturer_id: manufacturerId,
      category_id: categoryId,
    }),
    adminApi.equipmentManufacturers.all(1, 999),
    adminApi.equipmentCategories.all(),
  ]);

  const { items, total } = equipmentResult;
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
    return `/admin/equipment?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Equipment</h1>
        <Link
          href="/admin/equipment/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
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
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <button
          type="submit"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          Filter
        </button>
        {(manufacturerId || categoryId) && (
          <Link
            href="/admin/equipment"
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
            {items.map((e) => (
              <tr key={e.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {e.image_url ? (
                    <img src={e.image_url} alt={e.model} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200" />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-900">{e.model}</td>
                <td className="px-4 py-3 text-gray-600">{e.manufacturer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{e.category?.label ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/equipment/${encodeURIComponent(e.id)}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No equipment found.
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
