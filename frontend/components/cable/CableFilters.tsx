'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets } from '@/lib/types';
import { api } from '@/lib/api';
import { formatSizeLabel } from '@/lib/utils';

interface CableFiltersProps {
  facets: FilterFacets;
  industry: string;
  category: string;
  productType: string;
}

function CableFiltersInner({ facets, industry, category, productType }: CableFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ptConfig = api.taxonomy.productType(industry, category, productType);
  if (!ptConfig) return null;

  const sizeFilter = ptConfig.filters.find(f => f.spec_key === "size");
  const sizeSystem = ptConfig.size_system;
  const sizeControl = sizeFilter?.control; // "enum" | "enum_range" | undefined (none)

  const toggleParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    if (current.includes(value)) {
      params.delete(key);
      current.filter(v => v !== value).forEach(v => params.append(key, v));
    } else {
      params.append(key, value);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }, [router, searchParams, pathname]);

  const setNumericParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }, [router, searchParams, pathname]);

  const isChecked = (key: string, value: string): boolean => {
    return searchParams.getAll(key).includes(value);
  };

  const renderCheckboxGroup = (paramKey: string, options: { value: string; label: string; count: number }[]) => {
    if (options.length === 0) return null;
    return (
      <div className="space-y-1">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
            <input
              type="checkbox"
              checked={isChecked(paramKey, opt.value)}
              onChange={() => toggleParam(paramKey, opt.value)}
              className="rounded border-gray-300"
            />
            <span className="flex-1 text-gray-700">{opt.label}</span>
            <span className="text-gray-400 text-xs">({opt.count})</span>
          </label>
        ))}
      </div>
    );
  };

  // Enum spec keys from product type config (exclude size + outer_diameter which have dedicated UI)
  const enumSpecKeys: string[] = ptConfig.filters
    .filter(f => f.control === "enum" && f.spec_key !== "size" && f.spec_key !== "outer_diameter")
    .map(f => f.spec_key);

  // Build a lookup for filter labels
  const filterLabelByKey = new Map<string, string>();
  for (const f of ptConfig.filters) filterLabelByKey.set(f.spec_key, f.label);

  return (
    <aside className="w-52 shrink-0 space-y-5">
      {/* Manufacturer */}
      {facets.manufacturers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Manufacturer</h3>
          {renderCheckboxGroup('manufacturer', facets.manufacturers.map(m => ({ value: m.id, label: m.name, count: m.count })))}
        </div>
      )}

      {/* Brand */}
      {facets.brands.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Brand</h3>
          {renderCheckboxGroup('brand', facets.brands.map(b => ({ value: b.id, label: b.name, count: b.count })))}
        </div>
      )}

      {/* Size (enum only for awg; enum + range for mm2/kcmil; hidden for none) */}
      {sizeControl === "enum" && facets.size.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{sizeFilter!.label}</h3>
          {renderCheckboxGroup('size', facets.size.map(e => ({ value: e.value, label: e.value, count: e.count })))}
        </div>
      )}
      {sizeControl === "enum_range" && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">
            {sizeFilter!.label}{sizeFilter!.unit ? ` (${sizeFilter!.unit})` : ''}
          </h3>
          {facets.size.length > 0 && (
            <div className="mb-2">
              {renderCheckboxGroup('size', facets.size.map(e => ({ value: e.value, label: e.value, count: e.count })))}
            </div>
          )}
          {facets.size_range && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                placeholder={`min ${facets.size_range.min}`}
                value={searchParams.get('min_size') ?? ''}
                onChange={e => setNumericParam('min_size', e.target.value)}
                className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
              />
              <span className="text-gray-400">—</span>
              <input
                type="number"
                step="0.01"
                placeholder={`max ${facets.size_range.max}`}
                value={searchParams.get('max_size') ?? ''}
                onChange={e => setNumericParam('max_size', e.target.value)}
                className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
              />
            </div>
          )}
        </div>
      )}

      {/* Outer Diameter (range) */}
      {facets.outer_diameter && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Outer Diameter (mm)</h3>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              placeholder={`min ${facets.outer_diameter.min}`}
              value={searchParams.get('min_od') ?? ''}
              onChange={e => setNumericParam('min_od', e.target.value)}
              className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
            />
            <span className="text-gray-400">—</span>
            <input
              type="number"
              step="0.01"
              placeholder={`max ${facets.outer_diameter.max}`}
              value={searchParams.get('max_od') ?? ''}
              onChange={e => setNumericParam('max_od', e.target.value)}
              className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
            />
          </div>
        </div>
      )}

      {/* Config-driven enum spec filters (shielding, jacket, core_structure, etc.) */}
      {enumSpecKeys.map(specKey => {
        const facetEntries = facets.spec_facets[specKey];
        if (!facetEntries || facetEntries.length === 0) return null;
        const label = filterLabelByKey.get(specKey) ?? specKey;
        return (
          <div key={specKey}>
            <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{label}</h3>
            {renderCheckboxGroup(specKey, facetEntries.map(e => {
              let displayLabel = e.value;
              if (specKey === 'jacket') displayLabel = e.value.toUpperCase();
              else if (specKey === 'core_structure') displayLabel = e.value.replace(/_/g, ' ');
              return { value: e.value, label: displayLabel, count: e.count };
            }))}
          </div>
        );
      })}
    </aside>
  );
}

export function CableFilters(props: CableFiltersProps) {
  return (
    <Suspense fallback={<div className="w-52" />}>
      <CableFiltersInner {...props} />
    </Suspense>
  );
}
