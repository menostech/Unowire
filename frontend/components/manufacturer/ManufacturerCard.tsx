import Link from 'next/link';
import type { Manufacturer } from '@/lib/types';
import { formatManufacturerUrl } from '@/lib/utils';

export function ManufacturerCard({ manufacturer }: { manufacturer: Manufacturer }) {
  const typeLabel = manufacturer.type === 'cable_manufacturer' ? 'Cable Manufacturer' : 'Equipment Manufacturer';
  return (
    <Link
      href={formatManufacturerUrl(manufacturer.slug)}
      className="block border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-blue-300 transition"
    >
      <h3 className="font-semibold text-lg text-gray-900">{manufacturer.name}</h3>
      <p className="text-gray-600 text-sm mt-1">{typeLabel}</p>
      {manufacturer.country && (
        <p className="text-gray-500 text-sm mt-1">{manufacturer.country}</p>
      )}
      {manufacturer.description && (
        <p className="text-gray-600 text-sm mt-3 line-clamp-2">{manufacturer.description}</p>
      )}
    </Link>
  );
}
