import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { CableCard } from '@/components/cable/CableCard';
import { api } from '@/lib/api';
import { generateHomeMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return generateHomeMetadata();
}

export default async function HomePage() {
  const cables = await api.cables.all();
  const brands = await api.brands.all();
  const taxonomy = await api.taxonomy.all();
  const featuredCables = cables.slice(0, 6);

  // 每个 industry 的 cable 计数（按 cable.industry 字段匹配）
  const industryCounts = Object.entries(taxonomy).map(([id, industry]) => {
    const count = cables.filter(c => c.industry === id).length;
    return { id, industry, count };
  });

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-16">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4 text-gray-900">
              Cable Specs Database
            </h1>
            <p className="text-gray-600 mb-8">
              Query cable specifications online. Browse cables by brand, category, and technical parameters.
            </p>
            <div className="max-w-xl mx-auto">
              <SearchBox />
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-1">Popular searches:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['UL1007', 'AVSS', 'UL1015', 'UL2468'].map(q => (
                  <Link
                    key={q}
                    href={`/cables?q=${encodeURIComponent(q)}`}
                    className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-600 hover:border-blue-300 hover:text-blue-600"
                  >
                    {q}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 统计 */}
      <section className="border-b py-8">
        <Container>
          <div className="grid grid-cols-3 gap-4 text-center max-w-2xl mx-auto">
            <div>
              <p className="text-3xl font-bold text-blue-600">{cables.length}</p>
              <p className="text-sm text-gray-500">Cables</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{brands.length}</p>
              <p className="text-sm text-gray-500">Brands</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-600">{industryCounts.length}</p>
              <p className="text-sm text-gray-500">Industries</p>
            </div>
          </div>
        </Container>
      </section>

      {/* Industry 导航 */}
      <section className="py-12">
        <Container>
          <h2 className="mb-6">Browse by Category</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {industryCounts.map(({ id, industry, count }) => (
              <Link
                key={id}
                href="/cables"
                className="block border rounded-lg p-5 hover:shadow-md hover:border-blue-300 transition bg-white"
              >
                <h3 className="font-semibold text-gray-900 mb-1">{industry.label}</h3>
                {industry.description && (
                  <p className="text-xs text-gray-500 line-clamp-2 mb-1">{industry.description}</p>
                )}
                <p className="text-sm text-gray-500">{count} cable{count !== 1 ? 's' : ''}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* 热门线缆 */}
      <section className="py-12 bg-gray-50">
        <Container>
          <h2 className="text-2xl font-bold mb-6">Featured Cables</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(await Promise.all(featuredCables.map(async cable => {
              const brand = await api.brands.getById(cable.brand_id);
              const manufacturer = brand ? await api.manufacturers.getById(brand.manufacturer_id) : null;
              return (
                <CableCard key={cable.id} cable={cable} brand={brand} manufacturer={manufacturer} />
              );
            })))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/cables" className="text-blue-600 hover:underline">
              View all cables →
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
