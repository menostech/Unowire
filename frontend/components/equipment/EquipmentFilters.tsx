'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { EquipmentFilterFacets } from '@/lib/types';

interface Props {
  facets: EquipmentFilterFacets;
  allCategoryTree: {
    id: string;
    label: string;
    parent_id: string | null;
    children: { id: string; label: string }[];
  }[];
}

export function EquipmentFilters({ facets, allCategoryTree }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set((searchParams.get('category') ?? '').split(',').filter(Boolean))
  );
  const [selectedManufacturers, setSelectedManufacturers] = useState<Set<string>>(
    new Set((searchParams.get('manufacturer') ?? '').split(',').filter(Boolean))
  );

  // Spec filter state: { specKey: { min?, max?, values? } }
  const [specFilters, setSpecFilters] = useState<Record<string, { min?: string; max?: string; values?: Set<string> }>>({});

  // Initialize spec filter state from URL once
  useEffect(() => {
    const next: Record<string, { min?: string; max?: string; values?: Set<string> }> = {};
    for (const key of Object.keys(facets.spec_facets)) {
      const min = searchParams.get(`spec.${key}.min`) ?? undefined;
      const max = searchParams.get(`spec.${key}.max`) ?? undefined;
      const values = searchParams.get(`spec.${key}.values`)?.split(',').filter(Boolean);
      if (min || max || (values && values.length > 0)) {
        next[key] = {
          min: min ?? '',
          max: max ?? '',
          values: values ? new Set(values) : undefined,
        };
      }
    }
    setSpecFilters(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced keyword update
  useEffect(() => {
    const t = setTimeout(() => {
      const currentParams = searchParamsRef.current;
      if (keyword !== (currentParams.get('q') ?? '')) {
        // Build URL params from the CURRENT (ref) searchParams, not the stale closure
        const params = new URLSearchParams(currentParams.toString());
        if (keyword) params.set('q', keyword);
        else params.delete('q');
        params.delete('page');
        router.push(`/equipment?${params.toString()}#equipment-list`);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  function updateUrl(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') params.delete(k);
      else params.set(k, v);
    }
    params.delete('page'); // reset pagination on filter change
    router.push(`/equipment?${params.toString()}#equipment-list`);
  }

  function toggleCategory(id: string) {
    const next = new Set(selectedCategories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCategories(next);
    updateUrl({ category: Array.from(next).join(',') || undefined });
  }

  function toggleManufacturer(id: string) {
    const next = new Set(selectedManufacturers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedManufacturers(next);
    updateUrl({ manufacturer: Array.from(next).join(',') || undefined });
  }

  function toggleSpecValue(specKey: string, value: string) {
    const current = specFilters[specKey] ?? { values: new Set<string>() };
    const values = new Set(current.values ?? new Set<string>());
    if (values.has(value)) values.delete(value);
    else values.add(value);
    setSpecFilters((prev) => ({
      ...prev,
      [specKey]: { ...prev[specKey], values },
    }));
    // Commit to URL with freshly computed values (avoids stale-closure lag)
    const updates: Record<string, string | undefined> = {};
    updates[`spec.${specKey}.min`] = current.min || undefined;
    updates[`spec.${specKey}.max`] = current.max || undefined;
    updates[`spec.${specKey}.values`] = values.size > 0 ? Array.from(values).join(',') : undefined;
    updateUrl(updates);
  }

  function commitSpecFilter(specKey: string) {
    const filter = specFilters[specKey];
    if (!filter) return;
    const updates: Record<string, string | undefined> = {};
    updates[`spec.${specKey}.min`] = filter.min || undefined;
    updates[`spec.${specKey}.max`] = filter.max || undefined;
    updates[`spec.${specKey}.values`] =
      filter.values && filter.values.size > 0
        ? Array.from(filter.values).join(',')
        : undefined;
    updateUrl(updates);
  }

  function clearAll() {
    setKeyword('');
    setSelectedCategories(new Set());
    setSelectedManufacturers(new Set());
    setSpecFilters({});
    router.push('/equipment#equipment-list');
  }

  const hasActiveFilters =
    keyword ||
    selectedCategories.size > 0 ||
    selectedManufacturers.size > 0 ||
    Object.values(specFilters).some(
      (f) => f.min || f.max || (f.values && f.values.size > 0)
    );

  return (
    <div className="space-y-6">
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-blue-600 hover:underline"
        >
          Clear all filters
        </button>
      )}

      {/* Keyword search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search model or description..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Category tree */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-700">Categories</h3>
        <div className="space-y-2">
          {allCategoryTree.map((top) => (
            <div key={top.id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {top.label}
              </p>
              <div className="ml-3 mt-1 space-y-1">
                {top.children.map((child) => {
                  const facet = facets.categories.find((c) => c.id === child.id);
                  const count = facet?.count ?? 0;
                  const checked = selectedCategories.has(child.id);
                  return (
                    <label
                      key={child.id}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(child.id)}
                        className="rounded"
                      />
                      <span className="flex-1">{child.label}</span>
                      <span className="text-xs text-gray-400">{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manufacturers */}
      {facets.manufacturers.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-700">Manufacturers</h3>
          <div className="space-y-1">
            {facets.manufacturers.map((m) => {
              const checked = selectedManufacturers.has(m.id);
              return (
                <label
                  key={m.id}
                  className="flex items-center gap-2 text-sm text-gray-600"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleManufacturer(m.id)}
                    className="rounded"
                  />
                  <span className="flex-1">{m.name}</span>
                  <span className="text-xs text-gray-400">{m.count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Spec facets */}
      {Object.entries(facets.spec_facets).map(([specKey, facet]) => {
        const filter = specFilters[specKey] ?? {};
        return (
          <div key={specKey}>
            <h3 className="mb-2 text-sm font-medium text-gray-700 capitalize">
              {specKey.replace(/_/g, ' ')}
            </h3>
            {facet.type === 'range' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={`min ${facet.min ?? ''}`}
                  value={filter.min ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSpecFilters((prev) => ({
                      ...prev,
                      [specKey]: { ...prev[specKey], min: v },
                    }));
                  }}
                  onBlur={() => commitSpecFilter(specKey)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="number"
                  placeholder={`max ${facet.max ?? ''}`}
                  value={filter.max ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSpecFilters((prev) => ({
                      ...prev,
                      [specKey]: { ...prev[specKey], max: v },
                    }));
                  }}
                  onBlur={() => commitSpecFilter(specKey)}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            )}
            {facet.type === 'enum' && facet.values && (
              <div className="space-y-1">
                {facet.values.map((v) => {
                  const checked = filter.values?.has(v.value) ?? false;
                  return (
                    <label
                      key={v.value}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSpecValue(specKey, v.value)}
                        className="rounded"
                      />
                      <span className="flex-1">{v.value}</span>
                      <span className="text-xs text-gray-400">{v.count}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
