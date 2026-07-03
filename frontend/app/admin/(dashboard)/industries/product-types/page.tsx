import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { CategoryFilterSelect } from '@/components/admin/list/CategoryFilterSelect';

interface PageProps {
  searchParams: Promise<{ category_id?: string }>;
}

export default async function ProductTypesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const categoryFilter = sp.category_id;

  const [productTypes, industries] = await Promise.all([
    adminApi.taxonomy.productTypes.all(categoryFilter),
    adminApi.taxonomy.industries.all(),
  ]);

  // Flatten all categories for the filter dropdown
  const allCategories = industries.flatMap((i) => i.categories ?? []);
  const currentCategory = allCategories.find((c) => c.id === categoryFilter);

  // Build a lookup for industry/category labels
  const industryMap = new Map(industries.map((i) => [i.id, i.label]));
  const categoryMap = new Map(allCategories.map((c) => [c.id, c.label]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Product Types
          {currentCategory && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              in {currentCategory.label}
            </span>
          )}
        </h1>
        <Link
          href={categoryFilter
            ? `/admin/taxonomy/product-types/new?category_id=${encodeURIComponent(categoryFilter)}`
            : '/admin/taxonomy/product-types/new'}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3 text-sm">
        <label htmlFor="category_filter" className="text-gray-600">
          Filter by category:
        </label>
        <CategoryFilterSelect categories={allCategories} value={categoryFilter} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Image</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Size System</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productTypes.map((pt) => {
              const industryId = pt.category_id?.split('/')[0];
              return (
                <tr key={pt.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    {pt.image_url ? (
                      <img src={pt.image_url} alt={pt.label} className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-gray-200" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{industryMap.get(industryId || '') || industryId}</td>
                  <td className="px-4 py-3 text-gray-600">{categoryMap.get(pt.category_id) || pt.category_id}</td>
                  <td className="px-4 py-3 text-gray-900">{pt.label}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{pt.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{pt.size_system}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/taxonomy/product-types/${encodeURIComponent(pt.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
            {productTypes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No product types found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
