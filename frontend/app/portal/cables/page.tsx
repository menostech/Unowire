import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import type { PortalCable, TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalCablesPage() {
  let cables: PortalCable[] = [];
  try {
    cables = await portalApi.cables.all();
  } catch {
    // empty state
  }

  // Fetch taxonomy to resolve category/product type labels
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // non-fatal
  }

  // Build lookup maps for category and product type labels
  const categoryMap = new Map<string, string>();
  const productTypeMap = new Map<string, string>();
  for (const ind of taxonomy) {
    for (const cat of ind.categories ?? []) {
      categoryMap.set(cat.id, cat.label);
      for (const pt of cat.product_types ?? []) {
        productTypeMap.set(pt.id, pt.label);
      }
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cables</h1>
        <Link
          href="/portal/cables/new"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Cable
        </Link>
      </div>
      {cables.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No cables in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Product Type</th>
                <th className="px-4 py-3">Size System</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cables.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/portal/cables/${c.id}`} className="text-blue-600 hover:underline">
                      {c.model || c.slug || c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.manufacturer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{categoryMap.get(c.category_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{productTypeMap.get(c.product_type_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.size_system ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
