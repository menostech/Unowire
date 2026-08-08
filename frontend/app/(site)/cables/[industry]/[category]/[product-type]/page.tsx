import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { api } from '@/lib/api';
import { filterCables } from '@/lib/filter';
import { generateProductTypeMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: { params: Promise<{ industry: string; category: string; 'product-type': string }> }): Promise<Metadata> {
  const { industry: industrySlug, category: categorySlug, 'product-type': ptSlug } = await params;
  const found = await api.taxonomy.findBySlug(industrySlug, categorySlug, ptSlug);
  if (!found) return { title: 'Not Found' };
  return generateProductTypeMetadata(found.industry, found.category, found.productType);
}

interface SearchParams {
  q?: string;
  manufacturer?: string;
  size?: string;
  min_size?: string;
  max_size?: string;
  min_od?: string;
  max_od?: string;
  page?: string;
  // config-driven enum spec filters
  [key: string]: string | undefined;
}

function parseArrayParam(sp: SearchParams, key: keyof SearchParams): string[] | undefined {
  const val = sp[key];
  if (val === undefined) return undefined;
  return Array.isArray(val) ? val : [val];
}

export default async function ProductTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ industry: string; category: string; 'product-type': string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { industry: indSlug, category: catSlug, 'product-type': ptSlug } = await params;
  const found = await api.taxonomy.findBySlug(indSlug, catSlug, ptSlug);
  if (!found) notFound();
  const { industry, category, productType, industryKey, categoryKey, productTypeKey } = found;

  const sp = await searchParams;
  const page = parseInt(sp.page || '1');

  // Pack config-driven enum spec filters from search params.
  // Known non-spec keys are excluded; everything else that appears in the product type's
  // filter config as an enum filter (except size + outer_diameter) is packed into spec_filters.
  const knownKeys = new Set([
    'q', 'manufacturer', 'size', 'min_size', 'max_size',
    'min_od', 'max_od', 'page',
  ]);
  const specFilters: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (knownKeys.has(key) || value === undefined) continue;
    specFilters[key] = Array.isArray(value) ? value : [value];
  }

  const result = await filterCables({
    industry: industryKey,
    category: categoryKey,
    product_type: productTypeKey,
    q: sp.q,
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    size: parseArrayParam(sp, 'size'),
    min_size: sp.min_size ? parseFloat(sp.min_size) : undefined,
    max_size: sp.max_size ? parseFloat(sp.max_size) : undefined,
    spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
    min_od: sp.min_od ? parseFloat(sp.min_od) : undefined,
    max_od: sp.max_od ? parseFloat(sp.max_od) : undefined,
    page,
    page_size: 16,
  });

  const totalPages = Math.ceil(result.total / result.page_size);
  const basePath = `/cables/${indSlug}/${catSlug}/${ptSlug}`;

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: industry.label },
        { name: category.label },
        { name: productType.label },
      ]} />

      <div className="mb-4">
        <h1 className="text-2xl font-bold">{productType.label}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {result.total} cable{result.total !== 1 ? 's' : ''} in {category.label} · {industry.label}
        </p>
      </div>

      <div className="flex gap-6">
        <CableFilters
          facets={result.filters}
          ptConfig={productType}
        />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found. Try adjusting your filters.</p>
              <a href={basePath} className="text-accent-foreground hover:underline text-sm">Clear all filters</a>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map(item => (
                  <CableCard
                    key={item.cable.id}
                    cable={item.cable}
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
