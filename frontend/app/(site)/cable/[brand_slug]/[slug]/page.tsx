import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { VariantComparisonTable } from '@/components/cable/VariantComparisonTable';
import { RecommendedEquipmentCard } from '@/components/equipment/RecommendedEquipmentCard';
import { SimilarCables } from '@/components/shared/SimilarCables';
import { JsonLd } from '@/components/seo/JsonLd';
import { api, getCableUrl } from '@/lib/api';
import { generateCableMetadata, buildCableJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';

export const dynamic = 'force-dynamic';

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
  const matchedEquipment = await api.recommendedEquipments.byCable(cable.id);
  const recommended = matchedEquipment.map(equipment => ({ equipment, matched_variants: [], explanation: [] }));
  const similar = await api.cables.similar(cable, 4);
  const allManufacturers = await api.manufacturers.all();
  const jsonUrl = `/api/cables/${brand_slug}/${slug}`;
  const memberToken = (await cookies()).get('member_token')?.value;
  const isMember = !!memberToken;

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-16">
        {/* 主内容 */}
        <div className="lg:col-span-3 space-y-8">
          {/* 产品图片 */}
          <div className="max-w-[300px] h-auto bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={cable.image_url || '/cable-default.svg'}
              alt={cable.model}
              className="w-full h-auto"
            />
          </div>

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
        <aside className="lg:col-span-1 space-y-6">
          {/* Manufacturer */}
          {manufacturer && (
            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{manufacturer.name}</Link>
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
              <div className="mt-3">
                {isMember ? (
                  <InquiryFormModal
                    recipientType="manufacturer"
                    recipientId={manufacturer.id}
                    manufacturerName={manufacturer.name}
                    defaultSubject={`Inquiry about ${cable.model}`}
                  />
                ) : (
                  <Link
                    href={`/login?from=/cable/${brand_slug}/${slug}`}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium inline-block"
                  >
                    Login to Contact
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Recommended Manufacturers */}
          <ManufacturerRecommendations manufacturers={allManufacturers} />

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
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              View JSON
            </a>
          </div>
        </aside>
      </div>
    </Container>
  );
}
