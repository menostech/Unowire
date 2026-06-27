import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { CableSpecTable } from '@/components/cable/CableSpecTable';
import { api } from '@/lib/api';
import {
  generateCableMetadata,
  buildCableJsonLd,
  buildBreadcrumbJsonLd,
} from '@/lib/seo';

export const revalidate = 3600;

export async function generateStaticParams() {
  return api.cables.sitemap().map(s => ({
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
  const cable = api.cables.getBySlug(brand_slug, slug);
  if (!cable) {
    return { title: 'Cable Not Found' };
  }
  return generateCableMetadata(cable);
}

export default async function CableDetailPage({
  params,
}: {
  params: Promise<{ brand_slug: string; slug: string }>;
}) {
  const { brand_slug, slug } = await params;
  const cable = api.cables.getBySlug(brand_slug, slug);
  if (!cable) notFound();

  const manufacturer = api.manufacturers.list().find(m => m.id === cable.manufacturer_id);
  const sameBrandCables = api.cables.list({ brand: cable.brand_slug, page_size: 1000 })
    .items.filter(c => c.slug !== cable.slug).slice(0, 5);
  const sameAwgCables = cable.awg
    ? api.cables.list({ awg: cable.awg, page_size: 1000 })
        .items.filter(c => c.slug !== cable.slug).slice(0, 5)
    : [];

  return (
    <Container className="py-8">
      <JsonLd data={buildCableJsonLd(cable)} />
      <JsonLd data={buildBreadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: cable.brand, url: `/cables?brand=${cable.brand_slug}` },
        { name: cable.spec, url: `/cables/${cable.brand_slug}/${cable.slug}` },
      ])} />

      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Cables', url: '/cables' },
        { name: cable.brand, url: `/cables?brand=${cable.brand_slug}` },
        { name: cable.spec },
      ]} />

      <div className="grid md:grid-cols-2 gap-8 mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{cable.spec}</h1>
          <p className="text-gray-600 mb-6">
            by{' '}
            {manufacturer ? (
              <Link href={`/manufacturers/${manufacturer.slug}`} className="text-blue-600 hover:underline">
                {cable.brand}
              </Link>
            ) : cable.brand}
          </p>

          <h2 className="text-xl font-semibold mb-4">Specifications</h2>
          <CableSpecTable cable={cable} />
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Description</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            {cable.description || 'No description available.'}
          </p>

          <div className="border border-blue-200 bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold mb-2">Find Matching Equipment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Get a list of wire processing machines that can handle this cable.
            </p>
            <Link
              href={`/match?cable_id=${cable.id}`}
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Match Equipment →
            </Link>
          </div>
        </div>
      </div>

      {/* Related cables */}
      <div className="grid md:grid-cols-2 gap-8 mt-8">
        {sameBrandCables.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">More from {cable.brand}</h2>
            <ul className="space-y-2">
              {sameBrandCables.map(c => (
                <li key={c.id}>
                  <Link href={`/cables/${c.brand_slug}/${c.slug}`} className="text-blue-600 hover:underline">
                    {c.spec}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">— {c.conductor_area} mm², AWG {c.awg}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {sameAwgCables.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Other AWG {cable.awg} Cables</h2>
            <ul className="space-y-2">
              {sameAwgCables.map(c => (
                <li key={c.id}>
                  <Link href={`/cables/${c.brand_slug}/${c.slug}`} className="text-blue-600 hover:underline">
                    {c.spec}
                  </Link>
                  <span className="text-gray-500 text-sm ml-2">— {c.brand}, {c.conductor_area} mm²</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Container>
  );
}
