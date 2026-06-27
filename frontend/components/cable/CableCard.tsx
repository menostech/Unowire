import Link from 'next/link';
import type { CableListItem } from '@/lib/types';
import { formatCableUrl, formatShielding, formatJacket, formatCoreStructure } from '@/lib/utils';

export function CableCard({ cable }: { cable: CableListItem }) {
  return (
    <Link
      href={formatCableUrl(cable.brand_slug, cable.slug)}
      className="block border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">{cable.spec}</h3>
          <p className="text-gray-600 text-sm">{cable.brand}</p>
        </div>
        {cable.awg && (
          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">AWG {cable.awg}</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
        <span>{cable.conductor_area} mm²</span>
        <span>•</span>
        <span>{cable.outer_diameter} mm OD</span>
        <span>•</span>
        <span>{formatShielding(cable.shielding)}</span>
        <span>•</span>
        <span>{formatJacket(cable.jacket)}</span>
        <span>•</span>
        <span>{formatCoreStructure(cable.core_structure)}</span>
      </div>
    </Link>
  );
}
