import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { api } from '@/lib/api';
import {
  generateManufacturerMetadata,
  buildManufacturerJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';
import { formatCableUrl, formatEquipmentUrl } from '@/lib/utils';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.manufacturers.list().map(m => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const mfr = api.manufacturers.getBySlug(slug);
  if (!mfr) {
    return { title: 'Manufacturer Not Found' };
  }
  return generateManufacturerMetadata(mfr);
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mfr = api.manufacturers.getBySlug(slug);
  if (!mfr) notFound();

  const cables = api.manufacturers.cables(slug);
  const equipments = api.manufacturers.equipments(slug);
  const typeLabel = mfr.type === 'cable_manufacturer' ? 'Cable Manufacturer' : 'Equipment Manufacturer';

  return (
    <Container className="py-8">
      <JsonLd data={buildManufacturerJsonLd(mfr)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Manufacturers', url: '/manufacturers' },
        { name: mfr.name, url: `/manufacturers/${mfr.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers', url: '/manufacturers' },
        { name: mfr.name },
      ]} />

      <h1 className="text-3xl font-bold mb-2">{mfr.name}</h1>
      <p className="text-gray-600 mb-4">{typeLabel}</p>
      {mfr.country && <p className="text-gray-600 mb-4">{mfr.country}</p>}
      {mfr.description && (
        <p className="text-gray-700 leading-relaxed mb-6 max-w-2xl">{mfr.description}</p>
      )}
      {mfr.website && (
        <a
          href={mfr.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Official Website →
        </a>
      )}

      {cables.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Cables ({cables.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {cables.map(c => (
              <Link
                key={c.id}
                href={formatCableUrl(c.brand_slug, c.slug)}
                className="border border-gray-200 rounded p-4 hover:shadow hover:border-blue-300 transition"
              >
                <div className="font-medium">{c.spec}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {c.conductor_area} mm², {c.outer_diameter} mm OD
                  {c.awg && `, AWG ${c.awg}`}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {equipments.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Equipment ({equipments.length})</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {equipments.map(e => (
              <Link
                key={e.id}
                href={formatEquipmentUrl(e.brand_slug, e.slug)}
                className="border border-gray-200 rounded p-4 hover:shadow hover:border-blue-300 transition"
              >
                <div className="font-medium">{e.brand} {e.model}</div>
                <div className="text-sm text-gray-500 mt-1 capitalize">
                  {e.equipment_type.replace(/_/g, ' ')} · {e.conductor_area_min}–{e.conductor_area_max} mm²
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
