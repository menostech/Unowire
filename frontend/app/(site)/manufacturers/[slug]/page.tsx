import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CableCard } from '@/components/cable/CableCard';
import { JsonLd } from '@/components/seo/JsonLd';
import { api } from '@/lib/api';
import type { Brand, Cable, Manufacturer } from '@/lib/types';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';

export const dynamic = 'force-dynamic';

interface ProductTypeInfo {
  label: string;
  slug: string;
  industrySlug: string;
  categorySlug: string;
}

async function buildProductTypeMap(): Promise<Map<string, ProductTypeInfo>> {
  const taxonomy = await api.taxonomy.all();
  const map = new Map<string, ProductTypeInfo>();
  for (const [industryKey, industry] of Object.entries(taxonomy)) {
    for (const [catKey, category] of Object.entries(industry.categories)) {
      for (const [ptKey, productType] of Object.entries(category.product_types)) {
        map.set(ptKey, {
          label: productType.label,
          slug: productType.slug,
          industrySlug: industry.slug,
          categorySlug: category.slug,
        });
      }
    }
  }
  return map;
}

function buildOrganizationJsonLd(manufacturer: Manufacturer): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: manufacturer.name,
    url: manufacturer.website || undefined,
    logo: manufacturer.image_url || undefined,
    description: manufacturer.description || undefined,
    foundingDate: manufacturer.founded_year ? String(manufacturer.founded_year) : undefined,
    address: manufacturer.address ? {
      '@type': 'PostalAddress',
      streetAddress: manufacturer.address,
      addressCountry: manufacturer.country || undefined,
    } : manufacturer.country ? {
      '@type': 'PostalAddress',
      addressCountry: manufacturer.country,
    } : undefined,
    email: manufacturer.email || undefined,
    telephone: manufacturer.phone || undefined,
  };
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const manufacturer = await api.manufacturers.getBySlug(slug);
  if (!manufacturer) return { title: 'Manufacturer Not Found' };
  return {
    title: `${manufacturer.name} | Cable Manufacturers`,
    description: manufacturer.description?.slice(0, 160) || `Learn more about ${manufacturer.name}`,
  };
}

export default async function ManufacturerDetailPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const manufacturer = await api.manufacturers.getBySlug(slug);
  if (!manufacturer) notFound();

  const memberToken = (await cookies()).get('member_token')?.value;
  const isMember = !!memberToken;

  const allManufacturers = await api.manufacturers.all();
  const allBrands = await api.brands.all();
  const allCables = await api.cables.all();
  const productTypeMap = await buildProductTypeMap();

  const brands = allBrands.filter(b => b.manufacturer_id === manufacturer.id);
  const brandIds = new Set(brands.map(b => b.id));
  const cables = allCables.filter(c => brandIds.has(c.brand_id));

  const brandById = new Map<string, Brand>();
  for (const b of allBrands) brandById.set(b.id, b);

  const featuredCables = manufacturer.featured_cable_ids
    .map(id => cables.find(c => c.id === id))
    .filter((c): c is Cable => c !== undefined);

  const hasContactInfo = !!(manufacturer.address || manufacturer.phone || manufacturer.email);
  const hasAbout = !!manufacturer.description;
  const hasFeaturedCables = featuredCables.length > 0;
  const hasBrands = brands.length > 0;
  const hasCables = cables.length > 0;

  const cablesByProductType = new Map<string, Cable[]>();
  for (const cable of cables) {
    const key = cable.product_type;
    if (!cablesByProductType.has(key)) cablesByProductType.set(key, []);
    cablesByProductType.get(key)!.push(cable);
  }

  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Manufacturers', url: '/manufacturers' },
    { name: manufacturer.name },
  ];

  return (
    <Container className="py-6">
      <Breadcrumbs items={breadcrumbItems} />

      <JsonLd data={buildOrganizationJsonLd(manufacturer)} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
          { '@type': 'ListItem', position: 2, name: 'Manufacturers', item: '/manufacturers' },
          { '@type': 'ListItem', position: 3, name: manufacturer.name, item: `/manufacturers/${manufacturer.slug}` },
        ],
      }} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-0">
          {/* 1. Header Section */}
          <section className="mb-10">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="w-24 h-24 shrink-0 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {manufacturer.image_url ? (
                  <img
                    src={manufacturer.image_url}
                    alt={manufacturer.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-2xl font-bold text-gray-400">
                    {manufacturer.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">{manufacturer.name}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                  {manufacturer.founded_year && (
                    <span>Founded: {manufacturer.founded_year}</span>
                  )}
                  {manufacturer.country && (
                    <span>Country: {manufacturer.country}</span>
                  )}
                  {manufacturer.website && (
                    <a
                      href={manufacturer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Visit website →
                    </a>
                  )}
                </div>
                <div className="mt-4">
                  {isMember ? (
                    <InquiryFormModal
                      recipientType="manufacturer"
                      recipientId={manufacturer.id}
                      manufacturerName={manufacturer.name}
                    />
                  ) : (
                    <Link
                      href={`/login?from=/manufacturers/${manufacturer.slug}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium inline-block"
                    >
                      Login to Contact
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 2. About Section */}
          {hasAbout && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b">
                About {manufacturer.name}
              </h2>
              <div
                className="text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: manufacturer.description! }}
              />
            </section>
          )}

          {/* 3. Contact Section */}
          {hasContactInfo && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b">
                Contact Information
              </h2>
              <div className="space-y-2 text-sm">
                {manufacturer.address && (
                  <div className="flex gap-3">
                    <span className="text-gray-500 w-20 shrink-0">Address</span>
                    <span className="text-gray-900">{manufacturer.address}</span>
                  </div>
                )}
                {manufacturer.phone && (
                  <div className="flex gap-3">
                    <span className="text-gray-500 w-20 shrink-0">Phone</span>
                    <a href={`tel:${manufacturer.phone}`} className="text-blue-600 hover:underline">
                      {manufacturer.phone}
                    </a>
                  </div>
                )}
                {manufacturer.email && (
                  <div className="flex gap-3">
                    <span className="text-gray-500 w-20 shrink-0">Email</span>
                    <a href={`mailto:${manufacturer.email}`} className="text-blue-600 hover:underline">
                      {manufacturer.email}
                    </a>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 4. Featured Cables Section */}
          {hasFeaturedCables && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b">
                Featured Cables
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {featuredCables.map(cable => {
                  const brand = brandById.get(cable.brand_id) ?? null;
                  return (
                    <CableCard
                      key={cable.id}
                      cable={cable}
                      brand={brand}
                      manufacturer={manufacturer}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* 5. Brands Section */}
          {hasBrands && (
            <section className="mb-10">
              <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b">
                All Brands
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {brands.map(brand => (
                  <div
                    key={brand.id}
                    className="border rounded-lg p-4 bg-white"
                  >
                    <p className="font-medium text-gray-900">{brand.name}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 6. Cables by Product Type Section */}
          {hasCables && (
            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-3 pb-2 border-b">
                All Cables by Type
              </h2>
              <div className="space-y-8">
                {Array.from(cablesByProductType.entries()).map(([ptKey, ptCables]) => {
                  const ptInfo = productTypeMap.get(ptKey);
                  const heading = ptInfo?.label || ptKey;
                  const displayed = ptCables.slice(0, 6);
                  const hasMore = ptCables.length > 6;
                  const viewAllUrl = ptInfo
                    ? `/cables/${ptInfo.industrySlug}/${ptInfo.categorySlug}/${ptInfo.slug}`
                    : null;

                  return (
                    <div key={ptKey}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-800">{heading}</h3>
                        {hasMore && viewAllUrl && (
                          <a href={viewAllUrl} className="text-sm text-blue-600 hover:underline">
                            View all {ptCables.length} →
                          </a>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {displayed.map(cable => {
                          const brand = brandById.get(cable.brand_id) ?? null;
                          return (
                            <CableCard
                              key={cable.id}
                              cable={cable}
                              brand={brand}
                              manufacturer={manufacturer}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right sidebar: Recommendations */}
        <aside className="lg:col-span-1 space-y-6">
          <ManufacturerRecommendations manufacturers={allManufacturers} />
        </aside>
      </div>
    </Container>
  );
}
