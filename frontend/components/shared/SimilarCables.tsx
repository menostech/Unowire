import Link from 'next/link';
import type { Cable } from '@/lib/types';
import { getCableUrl } from '@/lib/api';
import { getPrimaryVariant, findVariantSpec } from '@/lib/utils';

interface SimilarCablesProps {
  cables: Cable[];
}

export function SimilarCables({ cables }: SimilarCablesProps) {
  if (cables.length === 0) return null;
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Similar Cables</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cables.map(cable => {
          const url = getCableUrl(cable);
          const primaryVariant = getPrimaryVariant(cable);
          const awgSpec = primaryVariant ? findVariantSpec(primaryVariant, "awg") : null;
          return (
            <Link key={cable.id} href={url} className="border rounded-lg p-3 hover:shadow-md transition bg-white">
              <h3 className="font-medium text-sm text-gray-900 truncate">{cable.model}</h3>
              <p className="text-xs text-gray-500">
                {awgSpec ? `AWG ${awgSpec.value}` : cable.variants[0]?.slug}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
