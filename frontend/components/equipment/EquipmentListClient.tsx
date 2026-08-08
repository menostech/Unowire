'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  EquipmentCategory,
  EquipmentFilterParams,
  EquipmentListResponse,
  EquipmentManufacturer,
  RecommendedEquipment,
} from '@/lib/types';
import { filterEquipment } from '@/lib/equipmentFilter';
import { EquipmentCard } from './EquipmentCard';
import { EquipmentFilters } from './EquipmentFilters';
import { HotEquipmentRecommendation } from './HotEquipmentRecommendation';
import { EquipmentManufacturerRecommendation } from './EquipmentManufacturerRecommendation';

interface Props {
  initialResponse: EquipmentListResponse;
  allEquipment: RecommendedEquipment[];
  allManufacturers: EquipmentManufacturer[];
  categoryTree: EquipmentCategory[];
}

export function EquipmentListClient({
  initialResponse,
  allEquipment,
  allManufacturers,
  categoryTree,
}: Props) {
  const searchParams = useSearchParams();
  const [response, setResponse] = useState<EquipmentListResponse>(initialResponse);

  // Build a simplified category tree for the filter component
  const filterCategoryTree = categoryTree.map((top) => ({
    id: top.id,
    label: top.label,
    parent_id: top.parent_id,
    children: (top.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
    })),
  }));

  useEffect(() => {
    const params: EquipmentFilterParams & { page?: number; page_size?: number } = {
      q: searchParams.get('q') ?? undefined,
      category_ids: (searchParams.get('category') ?? '').split(',').filter(Boolean),
      manufacturer_ids: (searchParams.get('manufacturer') ?? '').split(',').filter(Boolean),
      page: Number(searchParams.get('page') ?? '1') || 1,
      page_size: 12,
    };

    // Parse spec filters from URL
    const specFilters: EquipmentFilterParams['spec_filters'] = {};
    for (const key of searchParams.keys()) {
      if (key.startsWith('spec.')) {
        const match = key.match(/^spec\.([^.]+)\.(min|max|values)$/);
        if (match) {
          const [, specKey, field] = match;
          const value = searchParams.get(key);
          if (!value) continue;
          if (!specFilters[specKey]) specFilters[specKey] = {};
          if (field === 'values') {
            specFilters[specKey]!.values = value.split(',').filter(Boolean);
          } else if (field === 'min' || field === 'max') {
            specFilters[specKey]![field] = Number(value);
          }
        }
      }
    }
    if (Object.keys(specFilters).length > 0) {
      params.spec_filters = specFilters;
    }

    // Pure in-memory filtering — no network calls
    const result = filterEquipment(params, {
      allEquipment,
      allManufacturers,
      categoryTree,
    });
    setResponse(result);
  }, [searchParams, allEquipment, allManufacturers, categoryTree]);

  const activeCategoryId = searchParams.get('category')?.split(',')[0];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
      {/* Left column: filters */}
      <aside className="lg:col-span-1">
        <div className="sticky top-20">
          <EquipmentFilters
            facets={response.facets}
            allCategoryTree={filterCategoryTree}
          />
        </div>
      </aside>

      {/* Center column: equipment list */}
      <div className="lg:col-span-2" id="equipment-list">
        {response.items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            No equipment found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-500">
              Showing {response.items.length} of {response.total} equipment
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {response.items.map((eq) => (
                <EquipmentCard key={eq.id} equipment={eq} />
              ))}
            </div>
            {response.total > response.page_size && (
              <div className="mt-8 flex justify-center gap-2">
                {Array.from({ length: Math.ceil(response.total / response.page_size) }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - response.page) <= 2 || p === 1 || p === Math.ceil(response.total / response.page_size))
                  .map((p, i, arr) => {
                    const prev = arr[i - 1];
                    const showEllipsis = prev && p - prev > 1;
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('page', String(p));
                    return (
                      <span key={p} className="flex items-center gap-2">
                        {showEllipsis && <span className="text-gray-400">…</span>}
                        <a
                          href={`/equipment?${params.toString()}#equipment-list`}
                          className={`rounded border px-3 py-1 text-sm ${
                            p === response.page
                              ? 'border-accent-foreground bg-accent-foreground text-background'
                              : 'border-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {p}
                        </a>
                      </span>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right column: recommendations */}
      <aside className="lg:col-span-1 space-y-6">
        <HotEquipmentRecommendation
          equipments={allEquipment}
          excludeId={undefined}
        />
        <EquipmentManufacturerRecommendation
          manufacturers={allManufacturers}
          equipments={allEquipment}
          excludeId={undefined}
        />
      </aside>
    </div>
  );
}
