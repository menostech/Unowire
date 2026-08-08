import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { api } from '@/lib/api';
import type { Manufacturer } from '@/lib/types';
import { ManufacturerRecommendations } from '@/components/shared/ManufacturerRecommendations';

export const dynamic = 'force-dynamic';

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

  return (
    <Container className="py-6">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers' },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-16">
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
                          className="text-accent-foreground hover:underline"
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
          <ManufacturerRecommendations manufacturers={manufacturers} />
        </div>
      </div>
    </Container>
  );
}
