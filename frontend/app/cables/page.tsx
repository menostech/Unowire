import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { CableFilters } from '@/components/cable/CableFilters';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Cable Directory',
  description: 'Browse wire and cable specifications by manufacturer, AWG, and technical parameters.',
  robots: { index: true, follow: true },
};

interface SearchParams {
  q?: string;
  brand?: string;
  awg?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  conductor_area_min?: string;
  conductor_area_max?: string;
  outer_diameter_min?: string;
  outer_diameter_max?: string;
  page?: string;
}

export default async function CablesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const result = api.cables.list({
    q: sp.q,
    awg: sp.awg,
    brand: sp.brand,
    shielding: sp.shielding,
    jacket: sp.jacket,
    core_structure: sp.core_structure,
    conductor_area_min: sp.conductor_area_min ? parseFloat(sp.conductor_area_min) : undefined,
    conductor_area_max: sp.conductor_area_max ? parseFloat(sp.conductor_area_max) : undefined,
    outer_diameter_min: sp.outer_diameter_min ? parseFloat(sp.outer_diameter_min) : undefined,
    outer_diameter_max: sp.outer_diameter_max ? parseFloat(sp.outer_diameter_max) : undefined,
    page,
    page_size: 20,
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const brands = api.cables.allBrands();

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Cable Directory</h1>
      <p className="text-gray-600 mb-6">
        Browse {result.total} cable{result.total !== 1 ? 's' : ''} from {brands.length} brand{brands.length !== 1 ? 's' : ''}.
      </p>

      <div className="mb-6">
        <SearchBox />
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <CableFilters brands={brands} />
        <div className="flex-1">
          {result.items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No cables found. Try adjusting your filters.
            </div>
          ) : (
            <>
              <div className="grid gap-4">
                {result.items.map(cable => (
                  <CableCard key={cable.id} cable={cable} />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                basePath="/cables"
                searchParams={sp as Record<string, string | undefined>}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
