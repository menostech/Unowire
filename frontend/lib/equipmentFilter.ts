import { api } from './api';
import type {
  ApplicableSpecRule,
  EquipmentCategory,
  EquipmentFilterFacets,
  EquipmentFilterParams,
  EquipmentListResponse,
  EquipmentManufacturer,
  RecommendedEquipment,
} from './types';

export const SPEC_KEY_LABELS: Record<string, string> = {
  conductor_area: "Conductor Area",
  outer_diameter: "Outer Diameter",
  shielding: "Shielding",
  jacket: "Jacket",
  core_structure: "Core Structure",
};

export function specKeyLabel(key: string): string {
  return SPEC_KEY_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a spec rule's range intersects the user's range. */
function isRangeMatch(
  spec: ApplicableSpecRule,
  userMin: number | undefined,
  userMax: number | undefined
): boolean {
  if (userMin === undefined && userMax === undefined) return true;
  const specMin = spec.min ?? -Infinity;
  const specMax = spec.max ?? Infinity;
  const uMin = userMin ?? -Infinity;
  const uMax = userMax ?? Infinity;
  return specMin <= uMax && specMax >= uMin;
}

/** Check if a spec rule's allowed_values intersects the user's selected values. */
function isEnumMatch(
  spec: ApplicableSpecRule,
  selectedValues: string[] | undefined
): boolean {
  if (!selectedValues || selectedValues.length === 0) return true;
  const allowed = (spec.allowed_values ?? []).map(String);
  return selectedValues.some((v) => allowed.includes(v));
}

/** Main filter function. Loads all data, applies filters, builds facets, paginates. */
export async function filterEquipment(
  params: EquipmentFilterParams & { page?: number; page_size?: number }
): Promise<EquipmentListResponse> {
  const page = Math.max(1, params.page ?? 1);
  const page_size = params.page_size ?? 12;

  const [allEquipment, allManufacturers, categoryTree] = await Promise.all([
    api.recommendedEquipments.all(),
    api.equipmentManufacturers.all(),
    api.equipmentCategories.tree(),
  ]);

  const manufacturerMap = new Map(allManufacturers.map((m) => [m.id, m]));

  // Flatten category tree for id->category lookup
  const categoryMap = new Map<string, EquipmentCategory>();
  for (const top of categoryTree) {
    categoryMap.set(top.id, top);
    for (const child of top.children ?? []) {
      categoryMap.set(child.id, child);
    }
  }

  // 1. Keyword filter
  let filtered = allEquipment;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.model.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
    );
  }

  // 2. Category filter
  if (params.category_ids && params.category_ids.length > 0) {
    const categorySet = new Set(params.category_ids);
    filtered = filtered.filter((e) => categorySet.has(e.category_id));
  }

  // 3. Manufacturer filter
  if (params.manufacturer_ids && params.manufacturer_ids.length > 0) {
    const manufacturerSet = new Set(params.manufacturer_ids);
    filtered = filtered.filter((e) => manufacturerSet.has(e.manufacturer_id));
  }

  // 4. Spec filters (range + enum)
  if (params.spec_filters) {
    for (const [specKey, filter] of Object.entries(params.spec_filters)) {
      const hasRange = filter.min !== undefined || filter.max !== undefined;
      const hasEnum = filter.values && filter.values.length > 0;
      if (!hasRange && !hasEnum) continue;
      filtered = filtered.filter((e) => {
        const spec = e.applicable_specs.find((s) => s.spec_key === specKey);
        if (!spec) return false;
        if (hasRange && !isRangeMatch(spec, filter.min, filter.max)) return false;
        if (hasEnum && !isEnumMatch(spec, filter.values)) return false;
        return true;
      });
    }
  }

  // 5. Build facets from filtered result set
  const facets = buildFacets(filtered, allManufacturers, categoryMap);

  // 6. Pagination
  const total = filtered.length;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  return {
    items: paged,
    total,
    page,
    page_size,
    facets,
  };
}

/** Build facets from a filtered equipment list. */
function buildFacets(
  equipmentList: RecommendedEquipment[],
  allManufacturers: EquipmentManufacturer[],
  categoryMap: Map<string, EquipmentCategory>
): EquipmentFilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const specRangeMap = new Map<string, { min: number; max: number }>();
  const specEnumMap = new Map<string, Map<string, number>>();

  for (const e of equipmentList) {
    manufacturerCounts.set(
      e.manufacturer_id,
      (manufacturerCounts.get(e.manufacturer_id) ?? 0) + 1
    );
    categoryCounts.set(
      e.category_id,
      (categoryCounts.get(e.category_id) ?? 0) + 1
    );

    for (const spec of e.applicable_specs) {
      if (spec.min !== undefined || spec.max !== undefined) {
        const existing = specRangeMap.get(spec.spec_key);
        const specMin = spec.min ?? -Infinity;
        const specMax = spec.max ?? Infinity;
        if (existing) {
          existing.min = Math.min(existing.min, specMin);
          existing.max = Math.max(existing.max, specMax);
        } else {
          specRangeMap.set(spec.spec_key, { min: specMin, max: specMax });
        }
      } else if (spec.allowed_values && spec.allowed_values.length > 0) {
        if (!specEnumMap.has(spec.spec_key)) specEnumMap.set(spec.spec_key, new Map());
        const valueCounts = specEnumMap.get(spec.spec_key)!;
        for (const v of spec.allowed_values) {
          const valStr = String(v);
          valueCounts.set(valStr, (valueCounts.get(valStr) ?? 0) + 1);
        }
      }
    }
  }

  const manufacturers = allManufacturers
    .map((m) => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter((m) => m.count > 0);

  const categories: { id: string; label: string; parent_id: string | null; count: number }[] = [];
  for (const [id, count] of categoryCounts.entries()) {
    const cat = categoryMap.get(id);
    if (cat) {
      categories.push({
        id,
        label: cat.label,
        parent_id: cat.parent_id,
        count,
      });
    }
  }

  const spec_facets: EquipmentFilterFacets['spec_facets'] = {};
  for (const [key, range] of specRangeMap.entries()) {
    spec_facets[key] = {
      type: 'range',
      min: range.min === -Infinity ? undefined : range.min,
      max: range.max === Infinity ? undefined : range.max,
    };
  }
  for (const [key, valueCounts] of specEnumMap.entries()) {
    spec_facets[key] = {
      type: 'enum',
      values: Array.from(valueCounts.entries()).map(([value, count]) => ({ value, count })),
    };
  }

  return { manufacturers, categories, spec_facets };
}
