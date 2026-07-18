import Link from 'next/link';
import type { RecommendedEquipment } from '@/lib/types';

export function HotEquipmentRecommendation({
  equipments,
  excludeId,
}: {
  equipments: RecommendedEquipment[];
  excludeId?: string;
}) {
  const items = equipments
    .filter((e) => e.id !== excludeId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 3);

  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Hot Equipment</h3>
      <div className="grid grid-cols-3 gap-2">
        {items.map((e) => (
          <Link
            key={e.id}
            href={`/equipment/${encodeURIComponent(e.slug)}`}
            className="group block overflow-hidden rounded-md border border-gray-200 transition hover:shadow-sm"
          >
            <div className="aspect-square w-full overflow-hidden bg-gray-100">
              {e.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.image_url}
                  alt={e.model}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-1 text-center text-[10px] font-medium text-gray-700">
              {e.model}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
