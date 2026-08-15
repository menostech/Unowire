'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  TerminalCategory,
  TerminalFilterParams,
  TerminalListResponse,
  TerminalManufacturer,
  Terminal,
} from '@/lib/types';
import { filterTerminals } from '@/lib/terminalFilter';
import { TerminalCard } from './TerminalCard';
import { TerminalFilters } from './TerminalFilters';

interface Props {
  initialResponse: TerminalListResponse;
  allTerminals: Terminal[];
  allManufacturers: TerminalManufacturer[];
  categoryTree: TerminalCategory[];
}

export function TerminalListClient({
  initialResponse,
  allTerminals,
  allManufacturers,
  categoryTree,
}: Props) {
  const searchParams = useSearchParams();
  const [response, setResponse] = useState<TerminalListResponse>(initialResponse);

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
    const params: TerminalFilterParams & { page?: number; page_size?: number } = {
      q: searchParams.get('q') ?? undefined,
      category_ids: (searchParams.get('category') ?? '').split(',').filter(Boolean),
      manufacturer_ids: (searchParams.get('manufacturer') ?? '').split(',').filter(Boolean),
      page: Number(searchParams.get('page') ?? '1') || 1,
      page_size: 12,
    };

    // Parse spec filters from URL
    const specFilters: TerminalFilterParams['spec_filters'] = {};
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
    const result = filterTerminals(params, {
      allTerminals,
      allManufacturers,
      categoryTree,
    });
    setResponse(result);
  }, [searchParams, allTerminals, allManufacturers, categoryTree]);

  const activeCategoryId = searchParams.get('category')?.split(',')[0];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Left column: filters */}
      <aside className="lg:col-span-1">
        <div className="sticky top-20">
          <TerminalFilters
            facets={response.facets}
            allCategoryTree={filterCategoryTree}
          />
        </div>
      </aside>

      {/* Center column: terminals list */}
      <div className="lg:col-span-2" id="connectivity-list">
        {response.items.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 p-8 text-center text-muted-foreground">
            No connectivity products found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              Showing {response.items.length} of {response.total} connectivity products
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {response.items.map((term) => (
                <TerminalCard key={term.id} terminal={term} />
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
                        {showEllipsis && <span className="text-muted-foreground/60">…</span>}
                        <a
                          href={`/connectivity?${params.toString()}#connectivity-list`}
                          className={`rounded border px-3 py-1 text-sm ${
                            p === response.page
                              ? 'border-accent-foreground bg-accent-foreground text-background'
                              : 'border-border hover:bg-muted'
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
    </div>
  );
}
