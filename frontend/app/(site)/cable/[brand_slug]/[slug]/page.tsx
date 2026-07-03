import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { VariantComparisonTable } from '@/components/cable/VariantComparisonTable';
import { RecommendedEquipmentCard } from '@/components/equipment/RecommendedEquipmentCard';
import { SimilarCables } from '@/components/shared/SimilarCables';
import { JsonLd } from '@/components/seo/JsonLd';
import { api, getCableUrl } from '@/lib/api';
import { recommendEquipments } from '@/lib/equipment-recommend';
import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';

export const revalidate = 3600; // ISR 1h

export async function generateMetadata({
  params,
}: { params: Promise<{ brand_slug: string; slug: string }> }): Promise<Metadata> {
  const { brand_slug, slug } = await params;
  const cable = await api.cables.getByUrl(brand_slug, slug);
  if (!cable) return { title: 'Not Found' };
  const brand = await api.brands.getById(cable.brand_id);
  return generateCableMetadata(cable, brand);
}

export default async function CableDetailPage({
  params,
}: { params: Promise<{ brand_slug: string; slug: string }> }) {
  const { brand_slug, slug } = await params;
  const cable = await api.cables.getByUrl(brand_slug, slug);
  if (!cable) notFound();

  const brand = await api.brands.getById(cable.brand_id);
  const manufacturer = brand ? await api.manufacturers.getById(brand.manufacturer_id) : null;
  const categories = cable.category_ids
    ? await api.categories.getByIds(cable.category_ids)
    : [];
  const recommended = recommendEquipments(cable, await api.recommendedEquipments.all());
  const similar = await api.cables.similar(cable, 4);
  const jsonUrl = `/api/cables/${brand_slug}/${slug}`;

  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Cables', url: '/cables' },
    { name: brand?.name ?? 'Unknown', url: `/cables?brand=${cable.brand_id}` },
    { name: cable.model },
  ];

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <JsonLd data={buildCableJsonLd(cable, brand, manufacturer)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: brand?.name ?? 'Unknown', url: `/cables?brand=${cable.brand_id}` },
        { name: cable.model, url: getCableUrl(cable) },
      ])} />

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 主内容 */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* 标题 */}
          <div>
            <h1 className="mb-1">{cable.model}</h1>
            <p className="text-gray-600">
              {brand?.name ?? 'Unknown'}{manufacturer ? ` · ${manufacturer.country}` : ''}
            </p>
          </div>

          {/* 描述 */}
          <p className="text-gray-700 leading-relaxed">{cable.base_description}</p>

          {/* Common Specs */}
          <CableSpecTable specs={cable.common_specs} title="Common Specifications" />

          {/* Variants Comparison */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Variants Comparison</h2>
            <VariantComparisonTable cable={cable} />
          </div>

          {/* Recommended Equipment */}
          <div>
            <h2 className="mb-3">Recommended Equipment</h2>
            {recommended.length === 0 ? (
              <p className="text-gray-500 text-sm">No recommended equipment available for this cable.</p>
            ) : (
              <div className="grid gap-3">
                {recommended.map(r => (
                  <RecommendedEquipmentCard key={r.equipment.id} result={r} />
                ))}
              </div>
            )}
          </div>

          {/* Similar Cables */}
          <SimilarCables cables={similar} />
        </div>

        {/* 右侧栏 */}
        <aside className="lg:w-64 shrink-0 space-y-6">
          {/* Manufacturer */}
          {manufacturer && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
              <p className="text-sm font-medium text-gray-900">{manufacturer.name}</p>
              <p className="text-sm text-gray-500">{manufacturer.country}</p>
              {manufacturer.website && (
                <a
                  href={manufacturer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm mt-1 inline-block"
                >
                  Visit website →
                </a>
              )}
            </div>
          )}

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Categories</h3>
              <ul className="space-y-1">
                {categories.map(c => (
                  <li key={c.id}>
                    <a href={`/categories/${api.categories.pathSlugs(c.id).join('/')}`} className="text-sm text-blue-600 hover:underline">
                      {c.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* View JSON */}
          <div>
            <a
              href={jsonUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View JSON →
            </a>
          </div>
        </aside>
      </div>
    </Container>
  );
}
