import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { IndustryCard } from '@/components/taxonomy/IndustryCard';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';
import { filterCablesByText } from '@/lib/filter';
import { generateCablesListMetadata } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return generateCablesListMetadata();
}

interface SearchParams {
  q?: string;
  page?: string;
  [key: string]: string | undefined;
}

export default async function CablesOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Cross-industry text search mode
  if (sp.q) {
    const page = parseInt(sp.page || '1');
    const result = filterCablesByText({ q: sp.q, page, page_size: 16 });
    const totalPages = Math.ceil(result.total / result.page_size);
    return (
      <Container className="py-6">
        <Breadcrumbs items={[
          { name: 'Home', url: '/' },
          { name: 'Cables', url: '/cables' },
          { name: `Search: ${sp.q}` },
        ]} />
        <h1 className="text-2xl font-bold mb-1">Search Results</h1>
        <p className="text-sm text-gray-600 mb-4">
          {result.total} cable{result.total !== 1 ? 's' : ''} matching &ldquo;{sp.q}&rdquo;
        </p>
        <div className="mb-6">
          <SearchBox />
        </div>
        {result.items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-4">No cables found. Try a different search term.</p>
            <a href="/cables" className="text-blue-600 hover:underline text-sm">Back to Cable Directory</a>
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
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/cables"
              searchParams={{ q: sp.q }}
            />
          </>
        )}
      </Container>
    );
  }

  // Default: industry cards
  const industries = await api.taxonomy.industries();
  const allCables = await api.cables.all();
  const taxonomyAll = await api.taxonomy.all();
  const stats = industries.map(ind => {
    // Find the industry key by slug match
    let industryKey = "";
    for (const [k, v] of Object.entries(taxonomyAll)) {
      if (v === ind) { industryKey = k; break; }
    }
    const cableCount = allCables.filter(c => c.industry === industryKey).length;
    const categoryCount = Object.keys(ind.categories).length;
    return { industry: ind, categoryCount, cableCount };
  });

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Cable Directory</h1>
        <p className="text-sm text-gray-600 mb-4">
          Browse cables by industry. Select an industry to explore its categories and product types.
        </p>
        <SearchBox />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(s => (
          <IndustryCard
            key={s.industry.slug}
            industry={s.industry}
            categoryCount={s.categoryCount}
            cableCount={s.cableCount}
          />
        ))}
      </div>
    </Container>
  );
}
