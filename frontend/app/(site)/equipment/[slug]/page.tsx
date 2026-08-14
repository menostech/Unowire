import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentCard } from '@/components/equipment/EquipmentCard';
import { ApplicableSpecsTable } from '@/components/equipment/ApplicableSpecsTable';
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
  const equipment = await findEquipmentBySlug(slug);
  if (!equipment) return { title: 'Equipment Not Found' };
  const mfrName = equipment.manufacturer?.name ?? 'Unknown';
  return {
    title: `${equipment.model} - ${mfrName} | Unowire`,
    description: equipment.description?.slice(0, 160) ?? `Details and applicable specifications for ${equipment.model} by ${mfrName}.`,
  };
}

async function findEquipmentBySlug(slug: string) {
  const all = await api.recommendedEquipments.all();
  return all.find((e) => e.slug === slug) ?? null;
}

function buildProductJsonLd(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipment: any,
  manufacturerName: string,
  categoryName: string
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: equipment.model,
    image: equipment.image_url || undefined,
    description: equipment.description || undefined,
    category: categoryName,
    manufacturer: {
      '@type': 'Organization',
      name: manufacturerName,
    },
  };
}

function buildBreadcrumbJsonLd(model: string, manufacturerName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Equipment', item: '/equipment' },
      { '@type': 'ListItem', position: 3, name: `${model} - ${manufacturerName}` },
    ],
  };
}

export default async function EquipmentDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const equipment = await findEquipmentBySlug(slug);
  if (!equipment) notFound();

  const cookieStore = await cookies();
  const memberToken = cookieStore.get('member_token')?.value;

  const [allEquipment, allManufacturers] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
  ]);

  const manufacturer = equipment.manufacturer;
  const category = equipment.category;
  const manufacturerName = manufacturer?.name ?? 'Unknown';
  const categoryName = category?.label ?? '';

  // Equipment by same manufacturer (for cross-linking if needed)
  const sameManufacturerEquipment = allEquipment.filter(
    (e) => e.manufacturer_id === equipment.manufacturer_id && e.id !== equipment.id
  );

  // Fire-and-forget page view tracking. Errors are silently ignored.
  if (equipment?.id) {
    try {
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/page-views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'equipment', entity_id: String(equipment.id) }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  }

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', url: '/' },
          { name: 'Equipment', url: '/equipment' },
          { name: equipment.model },
        ]}
      />

      <JsonLd
        data={[
          buildProductJsonLd(equipment, manufacturerName, categoryName),
          buildBreadcrumbJsonLd(equipment.model, manufacturerName),
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Header block */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
              {equipment.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={equipment.image_url}
                  alt={equipment.model}
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 w-full items-center justify-center text-muted-foreground/40">
                  No image available
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="mono-label text-primary">SPECIFICATION</div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{equipment.model}</h1>
              {manufacturer && (
                <Link
                  href={`/equipment/manufacturers/${encodeURIComponent(manufacturer.slug)}`}
                  className="block text-accent-foreground hover:underline"
                >
                  {manufacturer.name}
                </Link>
              )}
              {category && (
                <span className="inline-block rounded-full bg-muted px-3 py-1 text-sm text-foreground/80">
                  {category.label}
                </span>
              )}
              {equipment.external_url && (
                <a
                  href={equipment.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-95"
                >
                  View Product →
                </a>
              )}
              {/* Inquiry CTA */}
              <div className="pt-2">
                {memberToken ? (
                  manufacturer && (
                    <InquiryFormModal
                      recipientType="equipment_manufacturer"
                      recipientId={manufacturer.id}
                      manufacturerName={manufacturer.name}
                      defaultSubject={`Inquiry about ${equipment.model}`}
                    />
                  )
                ) : (
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/equipment/${equipment.slug}`)}`}
                    className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    Login to Inquire
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {equipment.description && (
            <div>
              <h2 className="mb-2 text-xl font-semibold text-foreground">Description</h2>
              <p className="text-foreground/80 whitespace-pre-line">{equipment.description}</p>
            </div>
          )}

          {/* Applicable Specs Table */}
          <div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Applicable Specifications</h2>
            <ApplicableSpecsTable specs={equipment.applicable_specs} />
          </div>

          {/* More from this manufacturer */}
          {sameManufacturerEquipment.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                More from {manufacturerName}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sameManufacturerEquipment.slice(0, 3).map((eq) => (
                  <EquipmentCard key={eq.id} equipment={eq} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right aside */}
        <aside className="lg:col-span-1 space-y-6">
          <HotEquipmentRecommendation
            equipments={allEquipment}
            excludeId={equipment.id}
          />
          <EquipmentManufacturerRecommendation
            manufacturers={allManufacturers}
            equipments={allEquipment}
            excludeId={manufacturer?.id}
          />
        </aside>
      </div>
    </Container>
  );
}
