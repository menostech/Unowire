import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { api } from '@/lib/api';
import { filterCables } from '@/lib/filter';
import { getDescendantIds, getCategoryPathSlugs } from '@/lib/category-tree';
import { generateCategoryMetadata } from '@/lib/seo';
import type { CableQueryParams } from '@/lib/types';

interface SearchParams {
  manufacturer?: string;
  brand?: string;
  awg?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  min_area?: string;
  max_area?: string;
  min_od?: string;
  max_od?: string;
  page?: string;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slugs: string[] }> }): Promise<Metadata> {
  const { slugs } = await params;
  const found = api.categories.findByPath(slugs);
  if (!found) return { title: 'Not Found' };
  return generateCategoryMetadata(found.category);
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slugs: string[] }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slugs } = await params;
  const sp = await searchParams;
  const found = api.categories.findByPath(slugs);
  if (!found) notFound();

  const category = found.category;
  const descendantIds = getDescendantIds(category.id);

  // 在标准筛选基础上强制限定该分类
  const page = parseInt(sp.page || '1');
  const queryParams: CableQueryParams = {
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: [category.id],
    awg: parseArrayParam(sp, 'awg'),
    shielding: parseArrayParam(sp, 'shielding'),
    jacket: parseArrayParam(sp, 'jacket'),
    core_structure: parseArrayParam(sp, 'core_structure'),
    min_area: sp.min_area ? parseFloat(sp.min_area) : undefined,
    max_area: sp.max_area ? parseFloat(sp.max_area) : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  };
  const result = filterCables(queryParams);

  // 构建面包屑
  const ancestorPath = api.categories.ancestors(category.id);
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    ...ancestorPath.map((c, i) => ({
      name: c.name,
      url: `/categories/${getCategoryPathSlugs(c.id).slice(0, i + 1).join('/')}`,
    })),
  ];

  const totalPages = Math.ceil(result.total / result.page_size);
  const basePath = `/categories/${slugs.join('/')}`;

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <h1 className="text-2xl font-bold mb-1">{category.name}</h1>
      <p className="text-sm text-gray-600 mb-6">
        Cables in this category (and subcategories): {result.total}
      </p>

      <div className="flex gap-6">
        <CableFilters facets={result.filters} />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found in this category. Try adjusting your filters.</p>
              <a href={basePath} className="text-blue-600 hover:underline text-sm">Clear all filters</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => (
                  <CableCard
                    key={item.cable.id}
                    cable={item.cable}
                    brand={item.brand}
                    manufacturer={item.manufacturer}
                  />
                ))}
              </div>
              <div className="mt-6">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  basePath={basePath}
                  searchParams={sp as Record<string, string | undefined>}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
