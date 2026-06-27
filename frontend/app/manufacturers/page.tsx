import type { Metadata } from 'next';
import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { ManufacturerCard } from '@/components/manufacturer/ManufacturerCard';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Manufacturer Directory',
  description: 'Directory of cable and wire processing equipment manufacturers.',
  robots: { index: true, follow: true },
};

export default function ManufacturersPage() {
  const manufacturers = api.manufacturers.list();
  const cableMfrs = manufacturers.filter(m => m.type === 'cable_manufacturer');
  const equipMfrs = manufacturers.filter(m => m.type === 'equipment_manufacturer');

  return (
    <Container className="py-8">
      <Breadcrumbs items={[
        { name: 'Home', url: '/' },
        { name: 'Manufacturers' },
      ]} />

      <h1 className="text-3xl font-bold mb-2">Manufacturer Directory</h1>
      <p className="text-gray-600 mb-8">Browse {manufacturers.length} manufacturers in our directory.</p>

      {cableMfrs.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Cable Manufacturers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cableMfrs.map(m => (
              <ManufacturerCard key={m.id} manufacturer={m} />
            ))}
          </div>
        </section>
      )}

      {equipMfrs.length > 0 && (
        <section>
          <h2 className="text-2xl font-semibold mb-4">Equipment Manufacturers</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {equipMfrs.map(m => (
              <ManufacturerCard key={m.id} manufacturer={m} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
