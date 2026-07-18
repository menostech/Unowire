import Link from 'next/link';
import type { RecommendedEquipment } from '@/lib/types';

export function EquipmentCard({ equipment }: { equipment: RecommendedEquipment }) {
  return (
    <Link
      href={`/equipment/${encodeURIComponent(equipment.slug)}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100">
        {equipment.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={equipment.image_url}
            alt={equipment.model}
            className="h-48 w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600">
          {equipment.model}
        </h3>
        {equipment.manufacturer && (
          <p className="mt-1 text-sm text-gray-600">
            {equipment.manufacturer.name}
          </p>
        )}
        {equipment.category && (
          <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {equipment.category.label}
          </span>
        )}
      </div>
    </Link>
  );
}
