import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { IndustryFilterSelect } from '@/components/admin/list/IndustryFilterSelect';

interface PageProps {
  searchParams: Promise<{ industry_id?: string }>;
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const industryFilter = sp.industry_id;

  const [categories, industries] = await Promise.all([
    adminApi.taxonomy.categories.all(industryFilter),
    adminApi.taxonomy.industries.all(),
  ]);

  const currentIndustry = industries.find((i) => i.id === industryFilter);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Categories
          {currentIndustry && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              in {currentIndustry.label}
            </span>
          )}
        </h1>
        <Link
          href={industryFilter
            ? `/admin/taxonomy/categories/new?industry_id=${encodeURIComponent(industryFilter)}`
            : '/admin/taxonomy/categories/new'}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      {/* Industry filter dropdown */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <label htmlFor="industry_filter" className="text-gray-600">
          Filter by industry:
        </label>
        <IndustryFilterSelect industries={industries} value={industryFilter} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Product Types</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const industry = industries.find((i) => i.id === cat.industry_id);
              return (
                <tr key={cat.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {industry?.label ?? cat.industry_id}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{cat.label}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{cat.slug}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {cat.product_types?.length ?? 0}
                  </td>
                  <td className="px-4 py-3 space-x-3">
                    <Link
                      href={`/admin/taxonomy/categories/${encodeURIComponent(cat.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/taxonomy/product-types?category_id=${encodeURIComponent(cat.id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      View Product Types →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No categories found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
