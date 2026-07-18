import Link from 'next/link';
import type { EquipmentManufacturer, RecommendedEquipment } from '@/lib/types';

export function EquipmentManufacturerRecommendation({
  manufacturers,
  equipments,
  excludeId,
}: {
  manufacturers: EquipmentManufacturer[];
  equipments: RecommendedEquipment[];
  excludeId?: string;
}) {
  // Count equipment per manufacturer (from the full equipment list)
  const countByManufacturer = new Map<string, number>();
  for (const e of equipments) {
    countByManufacturer.set(
      e.manufacturer_id,
      (countByManufacturer.get(e.manufacturer_id) ?? 0) + 1
    );
  }

  const list = manufacturers
    .filter((m) => m.id !== excludeId)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      count: countByManufacturer.get(m.id) ?? 0,
    }))
    .filter((m) => m.count > 0);

  if (list.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Equipment Manufacturers</h3>
      <ul className="space-y-1.5">
        {list.slice(0, 10).map((m) => (
          <li key={m.id}>
            <Link
              href={`/equipment/manufacturers/${encodeURIComponent(m.slug)}`}
              className="flex items-center justify-between text-sm text-gray-600 hover:text-blue-600"
            >
              <span>{m.name}</span>
              <span className="text-xs text-gray-400">{m.count}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list.length > 10 && (
        <p className="mt-2 text-xs text-gray-400">
          +{list.length - 10} more manufacturers
        </p>
      )}
    </div>
  );
}
