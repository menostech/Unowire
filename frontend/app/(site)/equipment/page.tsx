import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { EquipmentCategoryNav } from '@/components/equipment/EquipmentCategoryNav';
import { EquipmentListClient } from '@/components/equipment/EquipmentListClient';
import { api } from '@/lib/api';
import { filterEquipment } from '@/lib/equipmentFilter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Equipment | Unowire',
  description: 'Browse cable processing equipment from leading manufacturers. Filter by category, manufacturer, and technical specifications.',
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    manufacturer?: string;
    page?: string;
    [key: string]: string | undefined;
  }>;
}

export default async function EquipmentListPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Build filter params from URL
  const categoryIds = (sp.category ?? '').split(',').filter(Boolean);
  const manufacturerIds = (sp.manufacturer ?? '').split(',').filter(Boolean);
  const page = Number(sp.page ?? '1') || 1;

  const specFilters: Record<string, { min?: number; max?: number; values?: string[] }> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (!key.startsWith('spec.') || !value) continue;
    const match = key.match(/^spec\.([^.]+)\.(min|max|values)$/);
    if (!match) continue;
    const [, specKey, field] = match;
    if (!specFilters[specKey]) specFilters[specKey] = {};
    if (field === 'values') {
      specFilters[specKey].values = value.split(',').filter(Boolean);
    } else if (field === 'min' || field === 'max') {
      specFilters[specKey][field] = Number(value);
    }
  }

  // Load initial filtered response + all data for the client wrapper
  const [initialResponse, allEquipment, allManufacturers, categoryTree] = await Promise.all([
    filterEquipment({
      q: sp.q,
      category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      manufacturer_ids: manufacturerIds.length > 0 ? manufacturerIds : undefined,
      spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
      page,
      page_size: 12,
    }),
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
    api.equipmentCategories.tree(),
  ]);

  const activeCategoryId = categoryIds[0];

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Equipment' }]} />
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Equipment</h1>

      <EquipmentCategoryNav
        categories={categoryTree}
        activeCategoryId={activeCategoryId}
      />

      <EquipmentListClient
        initialResponse={initialResponse}
        allEquipment={allEquipment}
        allManufacturers={allManufacturers}
        categoryTree={categoryTree}
      />
    </Container>
  );
}
