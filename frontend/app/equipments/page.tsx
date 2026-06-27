import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Equipment Directory',
  description: 'Browse wire processing equipment: stripping machines, cutting machines, and more.',
  robots: { index: true, follow: true },
};

interface SearchParams {
  q?: string;
  brand?: string;
  equipment_type?: string;
  page?: string;
}

export default async function EquipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1');
  const result = api.equipments.list({
    q: sp.q,
    brand: sp.brand,
    equipment_type: sp.equipment_type,
    page,
    page_size: 20,
  });
  const totalPages = Math.ceil(result.total / result.page_size);
  const brands = Array.from(new Set(api.equipments.list({ page_size: 1000 }).items.map(e => e.brand_slug)))
    .map(slug => {
      const mfr = api.manufacturers.getBySlug(slug);
      return { name: mfr?.name || slug, slug };
    });

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Equipment' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Equipment Directory</h1>
      <p className="text-gray-600 mb-6">Browse {result.total} wire processing equipment.</p>

      <div className="mb-6">
        <SearchBox placeholder="Search equipment by brand or model..." basePath="/equipments" />
      </div>

      {/* Quick type filter */}
      <div className="flex gap-2 mb-6">
        <a href="/equipments" className={`px-4 py-1 rounded-full text-sm border ${!sp.equipment_type ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          All Types
        </a>
        <a href="/equipments?equipment_type=semi_auto_stripping" className={`px-4 py-1 rounded-full text-sm border ${sp.equipment_type === 'semi_auto_stripping' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          Semi-Auto Stripping
        </a>
        <a href="/equipments?equipment_type=fully_auto_cutting_stripping" className={`px-4 py-1 rounded-full text-sm border ${sp.equipment_type === 'fully_auto_cutting_stripping' ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
          Fully-Auto Cutting & Stripping
        </a>
      </div>

      {result.items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No equipment found.</div>
      ) : (
        <>
          <div className="grid gap-4">
            {result.items.map(eq => (
              <EquipmentCard key={eq.id} equipment={eq} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath="/equipments"
            searchParams={sp as Record<string, string | undefined>}
          />
        </>
      )}
    </Container>
  );
}
