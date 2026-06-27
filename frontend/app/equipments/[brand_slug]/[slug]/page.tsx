import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { EquipmentSpecTable } from '@/components/equipment/EquipmentSpecTable';
import { api } from '@/lib/api';
import { formatEquipmentType } from '@/lib/utils';
import {
  generateEquipmentMetadata,
  buildEquipmentJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.equipments.sitemap().map(s => ({
    brand_slug: s.brand_slug,
    slug: s.slug,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand_slug: string; slug: string }>;
}): Promise<Metadata> {
  const { brand_slug, slug } = await params;
  const eq = api.equipments.getBySlug(brand_slug, slug);
  if (!eq) {
    return { title: 'Equipment Not Found' };
  }
  return generateEquipmentMetadata(eq);
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ brand_slug: string; slug: string }>;
}) {
  const { brand_slug, slug } = await params;
  const eq = api.equipments.getBySlug(brand_slug, slug);
  if (!eq) notFound();

  const manufacturer = api.manufacturers.list().find(m => m.id === eq.manufacturer_id);
  const sameTypeEquipment = api.equipments.list({ equipment_type: eq.equipment_type, page_size: 1000 })
    .items.filter(e => e.slug !== eq.slug).slice(0, 5);

  return (
    <Container className="py-8">
      <JsonLd data={buildEquipmentJsonLd(eq)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Equipment', url: '/equipments' },
        { name: eq.brand, url: `/equipments?brand=${eq.brand_slug}` },
        { name: `${eq.brand} ${eq.model}`, url: `/equipments/${eq.brand_slug}/${eq.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Equipment', url: '/equipments' },
        { name: eq.brand, url: `/equipments?brand=${eq.brand_slug}` },
        { name: `${eq.brand} ${eq.model}` },
      ]} />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{eq.brand} {eq.model}</h1>
          <p className="text-gray-600 mb-6 capitalize">
            {formatEquipmentType(eq.equipment_type)} · {eq.automation_level.replace(/_/g, ' ')}
          </p>

          <h2 className="text-xl font-semibold mb-4">Specifications</h2>
          <EquipmentSpecTable equipment={eq} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            {eq.description || 'No description available.'}
          </p>

          {eq.spec_pdf_url && (
            <a
              href={eq.spec_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition mb-6"
            >
              Download Spec Sheet (PDF) →
            </a>
          )}

          {manufacturer && (
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold mb-2">Manufacturer</h3>
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-blue-600 hover:underline">
                {manufacturer.name}
              </Link>
              {manufacturer.country && (
                <p className="text-sm text-gray-500 mt-1">{manufacturer.country}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {sameTypeEquipment.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Similar Equipment</h2>
          <ul className="space-y-2">
            {sameTypeEquipment.map(e => (
              <li key={e.id}>
                <Link href={`/equipments/${e.brand_slug}/${e.slug}`} className="text-blue-600 hover:underline">
                  {e.brand} {e.model}
                </Link>
                <span className="text-gray-500 text-sm ml-2">
                  — {e.conductor_area_min}–{e.conductor_area_max} mm²
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
