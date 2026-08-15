import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { Pagination } from '@/components/shared/Pagination';
import { SearchBox } from '@/components/shared/SearchBox';
import { ProductCardImage } from '@/components/shared/ProductCardImage';
import { api } from '@/lib/api';
import { filterCablesByText } from '@/lib/filter';
import { generateCablesListMetadata } from '@/lib/seo';
import type { TaxonomyIndustry, TaxonomyCategory, ProductTypeConfig } from '@/lib/types';

export const dynamic = 'force-dynamic';

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
    const result = await filterCablesByText({ q: sp.q, page, page_size: 16 });
    const totalPages = Math.ceil(result.total / result.page_size);
    return (
      <Container className="py-8">
        <Breadcrumbs items={[
          { name: 'Home', url: '/' },
          { name: 'Cables', url: '/cables' },
          { name: `Search: ${sp.q}` },
        ]} />
        <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Search Results</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {result.total} cable{result.total !== 1 ? 's' : ''} matching &ldquo;{sp.q}&rdquo;
        </p>
        <div className="mb-6">
          <SearchBox />
        </div>
        {result.items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-4">No cables found. Try a different search term.</p>
            <a href="/cables" className="text-accent-foreground hover:underline text-sm">Back to Cable Directory</a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {result.items.map(item => (
                <CableCard
                  key={item.cable.id}
                  cable={item.cable}
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

  // Default: show all product types grouped by industry
  const [industries, allCables, taxonomyAll] = await Promise.all([
    api.taxonomy.industries(),
    api.cables.all(),
    api.taxonomy.all(),
  ]);

  // Build flat list of all product types with cable/manufacturer counts, grouped by industry
  const industryGroups = industries.map(ind => {
    const industryKey = Object.entries(taxonomyAll).find(([, v]) => v.slug === ind.slug)?.[0] ?? "";
    const productTypes: Array<{
      productType: ProductTypeConfig;
      category: TaxonomyCategory;
      industry: TaxonomyIndustry;
      cableCount: number;
      manufacturerCount: number;
    }> = [];
    for (const [catKey, cat] of Object.entries(ind.categories)) {
      for (const [ptKey, pt] of Object.entries(cat.product_types)) {
        const ptCables = allCables.filter(c =>
          c.industry === industryKey && c.category === catKey && c.product_type === ptKey
        );
        const cableCount = ptCables.length;
        const manufacturerIds = new Set(ptCables.map(c => c.manufacturer_id));
        productTypes.push({
          productType: pt, category: cat, industry: ind,
          cableCount, manufacturerCount: manufacturerIds.size,
        });
      }
    }
    return { industry: ind, industryKey, productTypes };
  });

  const totalCables = allCables.length;
  const totalProductTypes = industryGroups.reduce((sum, g) => sum + g.productTypes.length, 0);

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables' },
      ]} />

      <div className="mb-6">
        <div className="mono-label text-primary">DIRECTORY / 01</div>
        <h1 className="text-3xl font-bold tracking-tight mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Cable Directory</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {totalCables} cables across {totalProductTypes} product types. Select a product type to browse cables.
        </p>
        <SearchBox />
      </div>

      {industryGroups.map(group => (
        <div key={group.industry.slug} className="mb-8">
          <h2 className="text-foreground mb-3 pb-2 border-b">
            {group.industry.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.productTypes.map(({ productType, category, industry, cableCount, manufacturerCount }) => {
              const imgSrc = productType.image_url || `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(`${productType.label} cable product photo, professional industrial product photography, clean white background`)}&image_size=square`;
              return (
                <a
                  key={`${industry.slug}/${category.slug}/${productType.slug}`}
                  href={`/cables/${industry.slug}/${category.slug}/${productType.slug}`}
                  className="flex items-stretch border border-border rounded-lg overflow-hidden transition hover:border-primary/30 bg-card"
                >
                  {/* Left: image */}
                  <div className="w-[8.4rem] shrink-0 bg-muted overflow-hidden aspect-square">
                    <ProductCardImage src={imgSrc} alt={productType.label} />
                  </div>
                  {/* Right: text */}
                  <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="text-base font-bold text-foreground truncate">{productType.label}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{category.label}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span>
                        {manufacturerCount} manufacturer{manufacturerCount !== 1 ? 's' : ''}
                      </span>
                      <span className="text-border">|</span>
                      <span>
                        {cableCount} cable{cableCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </Container>
  );
}
