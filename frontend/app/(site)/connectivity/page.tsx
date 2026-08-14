import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { TerminalCategoryNav } from '@/components/terminals/TerminalCategoryNav';
import { TerminalListClient } from '@/components/terminals/TerminalListClient';
import { api } from '@/lib/api';
import { filterTerminals } from '@/lib/terminalFilter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connectivity Products | Unowire',
  description: 'Browse connectivity products and connectors from leading manufacturers. Filter by category, manufacturer, and technical specifications.',
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

export default async function TerminalListPage({ searchParams }: PageProps) {
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

  // Load all data once, then filter in-memory
  const [allTerminals, allManufacturers, categoryTree] = await Promise.all([
    api.terminals.all(),
    api.terminalManufacturers.all(),
    api.terminalCategories.tree(),
  ]);

  const initialResponse = filterTerminals(
    {
      q: sp.q,
      category_ids: categoryIds.length > 0 ? categoryIds : undefined,
      manufacturer_ids: manufacturerIds.length > 0 ? manufacturerIds : undefined,
      spec_filters: Object.keys(specFilters).length > 0 ? specFilters : undefined,
      page,
      page_size: 12,
    },
    { allTerminals, allManufacturers, categoryTree }
  );

  const activeCategoryId = categoryIds[0];

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ name: 'Home', url: '/' }, { name: 'Connectivity Products' }]} />
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Connectivity Products</h1>

      <TerminalCategoryNav
        categories={categoryTree}
        activeCategoryId={activeCategoryId}
      />

      <TerminalListClient
        initialResponse={initialResponse}
        allTerminals={allTerminals}
        allManufacturers={allManufacturers}
        categoryTree={categoryTree}
      />
    </Container>
  );
}
