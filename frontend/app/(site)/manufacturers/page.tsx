import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { api } from '@/lib/api';
import type { Manufacturer } from '@/lib/types';

export function generateMetadata(): Metadata {
  return {
    title: 'Manufacturers',
    description: 'Browse all cable manufacturers in our directory',
    alternates: { canonical: '/manufacturers' },
    robots: { index: true, follow: true },
  };
}

export default async function ManufacturersPage() {
  const manufacturers = await api.manufacturers.all();

  const sorted = [...manufacturers].sort((a, b) => a.name.localeCompare(b.name));

  const grouped = new Map<string, Manufacturer[]>();
  for (const m of sorted) {
    const letter = m.name.charAt(0).toUpperCase();
    if (!grouped.has(letter)) {
      grouped.set(letter, []);
    }
    grouped.get(letter)!.push(m);
  }

  const letters = Array.from(grouped.keys()).sort();

  const featuredImage = manufacturers
    .filter(m => m.featured_image)
    .sort((a, b) => a.featured_image_sort - b.featured_image_sort);

  const featuredText = manufacturers
    .filter(m => m.featured_text)
    .sort((a, b) => a.featured_text_sort - b.featured_text_sort);

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers' },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 order-1 lg:order-1">
          <h1 className="text-2xl font-bold mb-6">Manufacturers</h1>

          {letters.length === 0 ? (
            <p className="text-gray-500">No manufacturers found.</p>
          ) : (
            <div className="space-y-8">
              {letters.map(letter => (
                <section key={letter}>
                  <h2 className="text-xl font-semibold text-gray-800 mb-3 pb-2 border-b">
                    {letter}
                  </h2>
                  <ul className="space-y-2">
                    {grouped.get(letter)!.map(m => (
                      <li key={m.id}>
                        <Link
                          href={`/manufacturers/${m.slug}`}
                          className="text-blue-600 hover:underline"
                        >
                          {m.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1 order-2 lg:order-2 space-y-6">
          {featuredImage.length > 0 && (
            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-base font-bold mb-4 text-gray-800">Featured Manufacturers</h3>
              <div className="space-y-4">
                {featuredImage.map(m => (
                  <Link
                    key={m.id}
                    href={`/manufacturers/${m.slug}`}
                    className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded transition -mx-2"
                  >
                    {m.image_url ? (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                        <img
                          src={m.image_url}
                          alt={m.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 shrink-0 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs font-bold">
                        {m.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {featuredText.length > 0 && (
            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-base font-bold mb-4 text-gray-800">Recommended Manufacturers</h3>
              <ul className="space-y-2">
                {featuredText.map(m => (
                  <li key={m.id}>
                    <Link
                      href={`/manufacturers/${m.slug}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {m.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
