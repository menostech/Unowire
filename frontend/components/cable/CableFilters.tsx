'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';
import type { FilterFacets } from '@/lib/types';

interface CableFiltersProps {
  facets: FilterFacets;
}

function CableFiltersInner({ facets }: CableFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const toggleParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.getAll(key);
    if (current.includes(value)) {
      // 移除
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

      {/* Category (level 1 only) */}
      {facets.categories.filter(c => c.level === 1).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Category</h3>
          {renderCheckboxGroup('category', facets.categories.filter(c => c.level === 1).map(c => ({ value: c.id, label: c.name, count: c.count })))}
        </div>
      )}

      {/* AWG */}
      {facets.awg.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">AWG</h3>
          {renderCheckboxGroup('awg', facets.awg.map(a => ({ value: a.value, label: a.value, count: a.count })))}
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

      {/* Shielding */}
      {facets.shielding.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Shielding</h3>
          {renderCheckboxGroup('shielding', facets.shielding.map(s => ({ value: s.value, label: s.value, count: s.count })))}
        </div>
      )}

      {/* Jacket */}
      {facets.jacket.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Jacket</h3>
          {renderCheckboxGroup('jacket', facets.jacket.map(j => ({ value: j.value, label: j.value.toUpperCase(), count: j.count })))}
        </div>
      )}

      {/* Core Structure */}
      {facets.core_structure.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-900 uppercase mb-2">Core Structure</h3>
          {renderCheckboxGroup('core_structure', facets.core_structure.map(c => ({ value: c.value, label: c.value.replace(/_/g, ' '), count: c.count })))}
        </div>
      )}
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
