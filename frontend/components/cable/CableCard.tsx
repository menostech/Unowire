import Link from 'next/link';
import type { Cable, Manufacturer } from '@/lib/types';
import { getCableUrl } from '@/lib/api';
import { getPrimaryVariant, findVariantSpec, formatSpecValue, formatSizeValue } from '@/lib/utils';

interface CableCardProps {
  cable: Cable;
  manufacturer?: Manufacturer | null;
}

export function CableCard({ cable, manufacturer }: CableCardProps) {
  const primaryVariant = getPrimaryVariant(cable);
  const url = getCableUrl(cable);
  const sizeSpec = primaryVariant ? findVariantSpec(primaryVariant, "size") : null;
  const odSpec = primaryVariant ? findVariantSpec(primaryVariant, "outer_diameter") : null;
  const jacketSpec = cable.common_specs.find(s => s.key === "jacket");
  const variantCount = cable.variants.length;

  return (
    <Link href={url} className="block border rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      {/* Image placeholder (no size badge) */}
      <div className="h-24 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
          <path d="M2 12h20" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      </div>

      {/* Title */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate">{cable.model}</h3>
        <div className="flex items-center gap-2 mb-2">
          {manufacturer?.image_url && (
            <img src={manufacturer.image_url} alt={manufacturer.name} className="h-6 w-6 rounded object-cover" />
          )}
          <p className="text-xs text-gray-500">
            {manufacturer?.name ?? "Unknown"}{manufacturer ? ` · ${manufacturer.country}` : ""}
          </p>
        </div>

        {/* Mini spec table */}
        <div className="text-xs space-y-0.5 mb-2">
          {sizeSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Size</span>
              <span className="text-gray-900">{formatSizeValue(cable.size_system, String(sizeSpec.value), sizeSpec.unit)}</span>
            </div>
          )}
          {odSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">OD</span>
              <span className="text-gray-900">{formatSpecValue(odSpec)}</span>
            </div>
          )}
          {jacketSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Jacket</span>
              <span className="text-gray-900 uppercase">{String(jacketSpec.value)}</span>
            </div>
          )}
        </div>

        {/* Variant preview */}
        {variantCount > 1 && (
          <div className="border-t pt-2">
            <p className="text-xs text-gray-500 mb-1">Variants ({variantCount})</p>
            <div className="space-y-0.5">
              {cable.variants.slice(0, 3).map(v => {
                const vSize = findVariantSpec(v, "size");
                return (
                  <div key={v.slug} className="flex justify-between text-xs">
                    <span className="text-gray-600">
                      {vSize ? formatSizeValue(cable.size_system, String(vSize.value), vSize.unit) : "—"}
                    </span>
                    <span className="text-gray-400">·</span>
                  </div>
                );
              })}
              {variantCount > 3 && (
                <div className="text-xs text-accent-foreground">+{variantCount - 3} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
