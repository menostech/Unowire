import Link from 'next/link';
import type { Cable, Brand, Manufacturer } from '@/lib/types';
import { getCableUrl } from '@/lib/api';
import { getPrimaryVariant, findVariantSpec, formatSpecValue } from '@/lib/utils';

interface CableCardProps {
  cable: Cable;
  brand?: Brand | null;
  manufacturer?: Manufacturer | null;
}

export function CableCard({ cable, brand, manufacturer }: CableCardProps) {
  const primaryVariant = getPrimaryVariant(cable);
  const url = getCableUrl(cable);
  const awgSpec = primaryVariant ? findVariantSpec(primaryVariant, "awg") : null;
  const areaSpec = primaryVariant ? findVariantSpec(primaryVariant, "conductor_area") : null;
  const odSpec = primaryVariant ? findVariantSpec(primaryVariant, "outer_diameter") : null;
  const jacketSpec = cable.common_specs.find(s => s.key === "jacket");
  const variantCount = cable.variants.length;

  return (
    <Link href={url} className="block border rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      {/* 图片占位区 */}
      <div className="h-24 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
          <path d="M2 12h20" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
        {awgSpec && (
          <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
            AWG {String(awgSpec.value)}
          </span>
        )}
      </div>

      {/* 标题 */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 truncate">{cable.model}</h3>
        <p className="text-xs text-gray-500 mb-2">
          {brand?.name ?? "Unknown"}{manufacturer ? ` · ${manufacturer.country}` : ""}
        </p>

        {/* 迷你规格表 */}
        <div className="text-xs space-y-0.5 mb-2">
          {areaSpec && (
            <div className="flex justify-between">
              <span className="text-gray-500">Area</span>
              <span className="text-gray-900">{formatSpecValue(areaSpec)}</span>
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

        {/* 变体表 */}
        {variantCount > 1 && (
          <div className="border-t pt-2">
            <p className="text-xs text-gray-500 mb-1">Variants ({variantCount})</p>
            <div className="space-y-0.5">
              {cable.variants.slice(0, 3).map(v => {
                const vAwg = findVariantSpec(v, "awg");
                const vArea = findVariantSpec(v, "conductor_area");
                return (
                  <div key={v.slug} className="flex justify-between text-xs">
                    <span className="text-gray-600">AWG {vAwg ? String(vAwg.value) : "—"}</span>
                    <span className="text-gray-600">{vArea ? `${vArea.value} ${vArea.unit ?? ""}` : "—"}</span>
                  </div>
                );
              })}
              {variantCount > 3 && (
                <div className="text-xs text-blue-600">+{variantCount - 3} more</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
