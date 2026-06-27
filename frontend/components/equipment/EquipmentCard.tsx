import Link from 'next/link';
import type { EquipmentListItem } from '@/lib/types';
import { formatEquipmentUrl, formatEquipmentType } from '@/lib/utils';

export function EquipmentCard({ equipment }: { equipment: EquipmentListItem }) {
  return (
    <Link
      href={formatEquipmentUrl(equipment.brand_slug, equipment.slug)}
      className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">{equipment.brand} {equipment.model}</h3>
          <p className="text-gray-600 text-sm capitalize">{formatEquipmentType(equipment.equipment_type)}</p>
        </div>
        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded capitalize">
          {equipment.automation_level.replace(/_/g, ' ')}
        </span>
      </div>
      <div className="mt-3 text-sm text-gray-500">
        <span>Conductor: {equipment.conductor_area_min}–{equipment.conductor_area_max} mm²</span>
      </div>
    </Link>
  );
}
