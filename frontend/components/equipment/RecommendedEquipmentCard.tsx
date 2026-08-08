import type { RecommendedEquipmentResult } from '@/lib/types';

interface RecommendedEquipmentCardProps {
  result: RecommendedEquipmentResult;
}

export function RecommendedEquipmentCard({ result }: RecommendedEquipmentCardProps) {
  const { equipment } = result;
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">
            {equipment.manufacturer?.name ?? 'Unknown'} {equipment.model}
          </h3>
          <p className="text-xs text-gray-500">
            {equipment.category?.label ?? 'Uncategorized'}
          </p>
        </div>
        {equipment.external_url && (
          <a
            href={equipment.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-foreground hover:underline text-sm shrink-0"
          >
            View product →
          </a>
        )}
      </div>

      {equipment.image_url && (
        <img src={equipment.image_url} alt={equipment.model} className="h-32 w-full object-cover rounded mb-3" />
      )}

      {equipment.description && (
        <p className="text-sm text-gray-600 mb-3">{equipment.description}</p>
      )}
    </div>
  );
}
