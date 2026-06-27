import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { SearchBox } from '@/components/shared/SearchBox';
import { api } from '@/lib/api';

export default function HomePage() {
  const cableBrands = api.cables.allBrands();
  const equipmentBrands = Array.from(new Set(api.equipments.list({ page_size: 1000 }).items.map(e => e.brand_slug)));
  const totalCables = api.cables.list({ page_size: 1000 }).total;
  const totalEquipments = api.equipments.list({ page_size: 1000 }).total;
  const totalManufacturers = api.manufacturers.list().length;

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-20">
        <Container className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">
            Wire Harness Industry Directory
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Find cable specifications and matched wire processing equipment from leading manufacturers.
          </p>
          <div className="flex justify-center mb-4">
            <SearchBox />
          </div>
          <div>
            <Link href="/match" className="text-blue-600 hover:underline">
              Or match equipment by cable parameters →
            </Link>
          </div>
        </Container>
      </section>

      {/* Stats */}
      <section className="border-y bg-white">
        <Container className="py-8">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalCables}</div>
              <div className="text-sm text-gray-600">Cables</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalEquipments}</div>
              <div className="text-sm text-gray-600">Equipment</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-600">{totalManufacturers}</div>
              <div className="text-sm text-gray-600">Manufacturers</div>
            </div>
          </div>
        </Container>
      </section>

      {/* Browse categories */}
      <section className="py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">Browse Directory</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/cables" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">🔌</div>
              <h3 className="text-xl font-semibold mb-2">Cables</h3>
              <p className="text-gray-600 text-sm">Browse wire and cable specifications by manufacturer and AWG.</p>
            </Link>
            <Link href="/equipments" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">⚙️</div>
              <h3 className="text-xl font-semibold mb-2">Equipment</h3>
              <p className="text-gray-600 text-sm">Wire processing machines: stripping, cutting, crimping.</p>
            </Link>
            <Link href="/manufacturers" className="border border-gray-200 rounded-lg p-8 hover:shadow-lg hover:border-blue-300 transition">
              <div className="text-4xl mb-4">🏭</div>
              <h3 className="text-xl font-semibold mb-2">Manufacturers</h3>
              <p className="text-gray-600 text-sm">Directory of cable and equipment manufacturers.</p>
            </Link>
          </div>
        </Container>
      </section>

      {/* Popular brands */}
      <section className="bg-gray-50 py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">Popular Brands</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {cableBrands.map(brand => (
              <Link
                key={brand.slug}
                href={`/cables?brand=${brand.slug}`}
                className="px-4 py-2 bg-white border rounded-full text-sm hover:border-blue-300 hover:shadow transition"
              >
                {brand.name}
              </Link>
            ))}
            {equipmentBrands.map(slug => {
              const mfr = api.manufacturers.getBySlug(slug);
              if (!mfr) return null;
              return (
                <Link
                  key={slug}
                  href={`/equipments?brand=${slug}`}
                  className="px-4 py-2 bg-white border rounded-full text-sm hover:border-blue-300 hover:shadow transition"
                >
                  {mfr.name}
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="py-16">
        <Container>
          <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Search Cable</h3>
              <p className="text-gray-600 text-sm">Find your cable by brand, model, or AWG.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">View Specs</h3>
              <p className="text-gray-600 text-sm">See full cable specifications and ratings.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Get Matched</h3>
              <p className="text-gray-600 text-sm">Find equipment that can process your cable.</p>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
