import type { RecommendedEquipmentResult } from '@/lib/types';

interface RecommendedEquipmentCardProps {
  result: RecommendedEquipmentResult;
}

export function RecommendedEquipmentCard({ result }: RecommendedEquipmentCardProps) {
  const { equipment, matched_variants, explanation } = result;
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-900">{equipment.brand} {equipment.model}</h3>
          <p className="text-xs text-gray-500 capitalize">
            {equipment.type.replace(/_/g, ' ')}
          </p>
        </div>
        <a
          href={equipment.external_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm shrink-0"
        >
          View product →
        </a>
      </div>

      <p className="text-sm text-gray-600 mb-3">{equipment.description}</p>

      {/* 匹配的变体 */}
      {matched_variants.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">Matched variants:</p>
          <div className="flex flex-wrap gap-1">
            {matched_variants.map(v => (
              <span key={v.slug} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
                {v.slug}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 为什么推荐 */}
      {explanation.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Why recommended:</p>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {explanation.map(e => (
              <li key={e.spec_key}>
                <span className="text-gray-500">{e.label}:</span>{' '}
                <span className="text-gray-900">{String(e.matched_value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
