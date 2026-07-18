import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { HotEquipmentRecommendation } from '@/components/equipment/HotEquipmentRecommendation';
import { EquipmentManufacturerRecommendation } from '@/components/equipment/EquipmentManufacturerRecommendation';
import { InquiryFormModal } from '@/components/member/InquiryFormModal';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const manufacturer = await api.equipmentManufacturers.getBySlug(slug);
  if (!manufacturer) return { title: 'Manufacturer Not Found' };
  return {
    title: `${manufacturer.name} | Equipment Manufacturers | Unowire`,
    description: manufacturer.description?.slice(0, 160) ?? `Learn more about ${manufacturer.name} and their cable processing equipment.`,
  };
}

function buildOrganizationJsonLd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: m.name,
    url: m.website || undefined,
    logo: m.image_url || undefined,
    description: m.description || undefined,
    foundingDate: m.founded_year ? String(m.founded_year) : undefined,
    address: m.address
      ? {
          '@type': 'PostalAddress',
          streetAddress: m.address,
          addressCountry: m.country || undefined,
        }
      : m.country
      ? {
          '@type': 'PostalAddress',
          addressCountry: m.country,
        }
      : undefined,
    email: m.email || undefined,
    telephone: m.phone || undefined,
  };
}

function buildBreadcrumbJsonLd(name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Equipment', item: '/equipment' },
      { '@type': 'ListItem', position: 3, name: 'Manufacturers', item: '/equipment#manufacturers' },
      { '@type': 'ListItem', position: 4, name },
    ],
  };
}

export default async function EquipmentManufacturerPage({ params }: PageProps) {
  const { slug } = await params;
  const manufacturer = await api.equipmentManufacturers.getBySlug(slug);
  if (!manufacturer) notFound();

  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const [allEquipment, allManufacturers] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
  ]);

  const manufacturerEquipment = allEquipment.filter(
    (e) => e.manufacturer_id === manufacturer.id
  );

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Equipment', url: '/equipment' },
          { name: 'Manufacturers' },
          { name: manufacturer.name },
        ]}
      />

      <JsonLd
        data={[
          buildOrganizationJsonLd(manufacturer),
          buildBreadcrumbJsonLd(manufacturer.name),
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header block */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex items-center justify-center rounded-lg bg-gray-50 p-4">
              {manufacturer.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={manufacturer.image_url}
                  alt={manufacturer.name}
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center text-gray-400">
                  No logo
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-2">
              <h1 className="text-3xl font-bold text-gray-900">{manufacturer.name}</h1>
              {manufacturer.country && (
                <p className="text-sm text-gray-600">{manufacturer.country}</p>
              )}
              {manufacturer.website && (
                <a
                  href={manufacturer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-blue-600 hover:underline"
                >
                  {manufacturer.website}
                </a>
              )}
              {manufacturer.founded_year && (
                <p className="text-sm text-gray-600">
                  Founded: {manufacturer.founded_year}
                </p>
              )}
              {/* Inquiry CTA */}
              <div className="pt-2">
                {memberToken ? (
                  <InquiryFormModal
                    recipientType="equipment_manufacturer"
                    recipientId={manufacturer.id}
                    manufacturerName={manufacturer.name}
                    defaultSubject={`Inquiry about ${manufacturer.name} equipment`}
                  />
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/equipment/manufacturers/${manufacturer.slug}`)}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Login to Inquire
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          {manufacturer.description && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">About</h2>
              <p className="text-gray-700 whitespace-pre-line">{manufacturer.description}</p>
            </div>
          )}

          {/* Contact Information */}
          {(manufacturer.address || manufacturer.phone || manufacturer.email) && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-gray-900">Contact Information</h2>
              <dl className="space-y-1 text-sm">
                {manufacturer.address && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Address:</dt>
                    <dd className="text-gray-900">{manufacturer.address}</dd>
                  </div>
                )}
                {manufacturer.phone && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Phone:</dt>
                    <dd className="text-gray-900">{manufacturer.phone}</dd>
                  </div>
                )}
                {manufacturer.email && (
                  <div className="flex gap-2">
                    <dt className="font-medium text-gray-600">Email:</dt>
                    <dd>
                      <a
                        href={`mailto:${manufacturer.email}`}
                        className="text-blue-600 hover:underline"
                      >
                        {manufacturer.email}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Equipment Products */}
          <div>
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              Equipment ({manufacturerEquipment.length})
            </h2>
            {manufacturerEquipment.length === 0 ? (
              <p className="text-gray-500">No equipment listed yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {manufacturerEquipment.map((eq) => (
                  <EquipmentCard key={eq.id} equipment={eq} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right aside */}
        <aside className="lg:col-span-1 space-y-6">
          <HotEquipmentRecommendation
            equipments={allEquipment.filter(
              (e) => e.manufacturer_id !== manufacturer.id
            )}
            excludeId={undefined}
          />
          <EquipmentManufacturerRecommendation
            manufacturers={allManufacturers}
            equipments={allEquipment}
            excludeId={manufacturer.id}
          />
        </aside>
      </div>
    </Container>
  );
}
