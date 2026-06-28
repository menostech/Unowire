import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { filterCables } from '@/lib/filter';
import { generateCablesListMetadata } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return generateCablesListMetadata();
}

interface SearchParams {
  q?: string;
  manufacturer?: string;
  brand?: string;
  category?: string;
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

export default async function CablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const result = filterCables({
    q: sp.q,
    manufacturer: parseArrayParam(sp, 'manufacturer'),
    brand: parseArrayParam(sp, 'brand'),
    category: parseArrayParam(sp, 'category'),
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
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const hasFilters = result.total !== filterCables({ page: 1, page_size: 1 }).total;

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Cable Directory</h1>
          <p className="text-sm text-gray-600 mt-1">
            Browse {result.total} cable{result.total !== 1 ? 's' : ''} from {result.filters.brands.length} brand{result.filters.brands.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        <CableFilters facets={result.filters} />
        <div className="flex-1 min-w-0">
          {result.items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="mb-4">No cables found. Try adjusting your filters.</p>
              <a href="/cables" className="text-blue-600 hover:underline text-sm">Clear all filters</a>
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
                  basePath="/cables"
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
