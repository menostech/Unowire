import type { Cable, CableVariant, SpecItem } from '@/lib/types';
import { formatSpecValue } from '@/lib/utils';

interface VariantComparisonTableProps {
  cable: Cable;
}

/** 收集所有变体中出现的所有 spec key（按首次出现顺序） */
function collectAllSpecKeys(cable: Cable): { key: string; label: string }[] {
  const seen = new Set<string>();
  const result: { key: string; label: string }[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        result.push({ key: s.key, label: s.label });
      }
    }
  }
  return result;
}

/** 从变体中查找指定 key 的 SpecItem */
function findSpecInVariant(variant: CableVariant, key: string): SpecItem | undefined {
  return variant.specs.find(s => s.key === key);
}

export function VariantComparisonTable({ cable }: VariantComparisonTableProps) {
  if (cable.variants.length === 0) {
    return <p className="text-gray-500 text-sm">No variants available.</p>;
  }

  const specKeys = collectAllSpecKeys(cable);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-2 px-3 font-semibold text-gray-700">Spec</th>
            {cable.variants.map(v => (
              <th key={v.slug} className="text-left py-2 px-3 font-semibold text-gray-700">
                {v.slug}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {specKeys.map(({ key, label }) => (
            <tr key={key} className="border-b last:border-0">
              <td className="py-2 px-3 text-gray-600">{label}</td>
              {cable.variants.map(v => {
                const spec = findSpecInVariant(v, key);
                return (
                  <td key={v.slug} className="py-2 px-3 text-gray-900">
                    {spec ? formatSpecValue(spec) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
