import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import { CableListToolbar } from '@/components/portal/cable/CableListToolbar';
import type { PortalCable, TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    industry_id?: string;
    category_id?: string;
    product_type_id?: string;
  }>;
}

export default async function PortalCablesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [cables, taxonomy] = await Promise.all([
    portalApi
      .cables.all({
        search: params.search,
        industry_id: params.industry_id,
        category_id: params.category_id,
        product_type_id: params.product_type_id,
      })
      .catch(() => [] as PortalCable[]),
    fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<TaxonomyIndustry[]>) : []))
      .catch(() => [] as TaxonomyIndustry[]),
  ]);

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
        <div className="flex items-center gap-2">
          <Link
            href="/portal/cables/import"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/portal/cables/new"
            className="rounded bg-accent-foreground px-4 py-2 text-sm font-medium text-background hover:brightness-95"
          >
            New Cable
          </Link>
        </div>
      </div>

      <CableListToolbar taxonomy={taxonomy} />

      {cables.length === 0 ? (
        <p className="text-sm text-gray-500">No cables found.</p>
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
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cables.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{c.model || c.slug || c.id}</td>
                  <td className="px-4 py-3 text-gray-600">{c.manufacturer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{categoryMap.get(c.category_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{productTypeMap.get(c.product_type_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.size_system ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/portal/cables/${c.id}`}
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Edit
                    </Link>
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
