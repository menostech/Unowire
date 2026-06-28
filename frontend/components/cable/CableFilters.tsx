'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets, Industry, SizeSystem } from '@/lib/types';
import { api } from '@/lib/api';
import { formatSizeLabel } from '@/lib/utils';

interface CableFiltersProps {
  facets: FilterFacets;
}

function CableFiltersInner({ facets }: CableFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterConfig = api.filterConfig.all();

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
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

  const setNumericParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    router.push(`/cables?${params.toString()}`);
  }, [router, searchParams]);

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

  // Group size facet by size_system for multi-label rendering
  const sizeBySystem = new Map<SizeSystem, { value: string; count: number }[]>();
  for (const s of facets.size) {
    if (!sizeBySystem.has(s.size_system)) sizeBySystem.set(s.size_system, []);
    sizeBySystem.get(s.size_system)!.push({ value: s.value, count: s.count });
  }

  // Determine which enum spec facets to render (from spec_facets keys, ordered by config)
  // We render specs that appear in the in-scope types' filter config. Since facets.spec_facets
  // already only contains in-scope keys, we render them in config definition order.
  const enumSpecKeys: string[] = [];
  for (const ind of Object.values(filterConfig)) {
    for (const t of Object.values(ind.types)) {
      for (const f of t.filters) {
        if (f.control === "enum" && f.spec_key !== "size" && facets.spec_facets[f.spec_key] && !enumSpecKeys.includes(f.spec_key)) {
          enumSpecKeys.push(f.spec_key);
        }
      }
    }
  }

  return (
    <aside className="w-52 shrink-0 space-y-5">
      {/* Industry (top-level) */}
      {facets.industries.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Industry</h3>
          {renderCheckboxGroup('industry', facets.industries.map(i => ({ value: i.value, label: i.label, count: i.count })))}
        </div>
      )}

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

      {/* Category (level 1 only) */}
      {facets.categories.filter(c => c.level === 1).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Category</h3>
          {renderCheckboxGroup('category', facets.categories.filter(c => c.level === 1).map(c => ({ value: c.id, label: c.name, count: c.count })))}
        </div>
      )}

      {/* Size (grouped by size_system, each group labeled dynamically) */}
      {sizeBySystem.size > 0 && (
        <div>
          {Array.from(sizeBySystem.entries()).map(([sys, entries]) => (
            <div key={sys} className="mb-3">
              <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">{formatSizeLabel(sys)}</h3>
              {renderCheckboxGroup('size', entries.map(e => ({ value: e.value, label: e.value, count: e.count })))}
            </div>
          ))}
        </div>
      )}

      {/* Conductor Area (range) */}
      <div>
        <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Conductor Area (mm²)</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.01"
            placeholder={`min ${facets.conductor_area.min}`}
            value={searchParams.get('min_area') ?? ''}
            onChange={e => setNumericParam('min_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            step="0.01"
            placeholder={`max ${facets.conductor_area.max}`}
            value={searchParams.get('max_area') ?? ''}
            onChange={e => setNumericParam('max_area', e.target.value)}
            className="w-20 h-8 px-2 text-xs border border-gray-300 rounded"
          />
        </div>
      </div>

      {/* Outer Diameter (range) */}
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

      {/* Config-driven enum spec filters (shielding, jacket, core_structure, insulation, etc.) */}
      {enumSpecKeys.map(specKey => {
        const facetEntries = facets.spec_facets[specKey];
        if (!facetEntries || facetEntries.length === 0) return null;
        // Find the label from the filter config
        let label = specKey;
        for (const ind of Object.values(filterConfig)) {
          for (const t of Object.values(ind.types)) {
            const f = t.filters.find(f => f.spec_key === specKey);
            if (f) { label = f.label; break; }
          }
        }
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
