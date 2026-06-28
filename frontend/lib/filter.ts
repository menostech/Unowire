import type {
  Cable, CableListItem, CableListResponse, CableQueryParams,
  FilterFacets, Industry, IndustryFilterConfig, SizeSystem,
} from './types';
import { api } from './api';
import { getDescendantIds } from './category-tree';

/** Collect all numeric values for a spec key across all variants */
function getAllNumericValues(cable: Cable, key: string): number[] {
  const values: number[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key && typeof s.value === "number") values.push(s.value);
    }
  }
  return values;
}

/** Collect all distinct values for a spec key across common_specs + variants */
function collectSpecValues(cable: Cable, key: string): (string | number)[] {
  const values = new Set<string | number>();
  for (const s of cable.common_specs) {
    if (s.key === key) values.add(s.value);
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) values.add(s.value);
    }
  }
  return Array.from(values);
}

/**
 * Determine the in-scope filter config for a cable list.
 * Returns the union of TypeFilterConfig entries for all industries/types
 * present in the list. If industries are selected in params, restricts to
 * those industries only.
 */
function getInScopeFilterConfig(cableList: Cable[], params: CableQueryParams): {
  industries: Industry[];
  typesByIndustry: Map<Industry, string[]>;
  config: Record<Industry, IndustryFilterConfig>;
} {
  const config = api.filterConfig.all();
  const selectedIndustries = params.industry && params.industry.length > 0
    ? new Set(params.industry)
    : null;

  const industries = new Set<Industry>();
  const typesByIndustry = new Map<Industry, Set<string>>();

  for (const cable of cableList) {
    if (selectedIndustries && !selectedIndustries.has(cable.industry)) continue;
    industries.add(cable.industry);
    if (!typesByIndustry.has(cable.industry)) typesByIndustry.set(cable.industry, new Set());
    typesByIndustry.get(cable.industry)!.add(cable.type);
  }

  return {
    industries: Array.from(industries),
    typesByIndustry: new Map(Array.from(typesByIndustry.entries()).map(([k, v]) => [k, Array.from(v)])),
    config,
  };
}

/** Main filter function */
export function filterCables(params: CableQueryParams): CableListResponse {
  let filtered = [...api.cables.all()];

  // Keyword search
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }

  // Manufacturer filter
  if (params.manufacturer && params.manufacturer.length > 0) {
    const manufacturerIds = new Set(params.manufacturer);
    filtered = filtered.filter(c => {
      const brand = api.brands.getById(c.brand_id);
      return brand && manufacturerIds.has(brand.manufacturer_id);
    });
  }

  // Brand filter
  if (params.brand && params.brand.length > 0) {
    const brandIds = new Set(params.brand);
    filtered = filtered.filter(c => brandIds.has(c.brand_id));
  }

  // Category filter (including descendants)
  if (params.category && params.category.length > 0) {
    const allCatIds = new Set<string>();
    for (const catId of params.category) {
      for (const d of getDescendantIds(catId)) allCatIds.add(d);
    }
    filtered = filtered.filter(c => c.category_ids.some(id => allCatIds.has(id)));
  }

  // Industry filter
  if (params.industry && params.industry.length > 0) {
    const industrySet = new Set(params.industry);
    filtered = filtered.filter(c => industrySet.has(c.industry));
  }

  // Size filter (any variant matches) — replaces awg
  if (params.size && params.size.length > 0) {
    const sizeSet = new Set(params.size);
    filtered = filtered.filter(c =>
      c.variants.some(v => v.specs.some(s => s.key === "size" && sizeSet.has(String(s.value))))
    );
  }

  // Range filter: conductor_area (any variant in range)
  if (params.min_area !== undefined || params.max_area !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "conductor_area");
      return values.some(v =>
        (params.min_area === undefined || v >= params.min_area) &&
        (params.max_area === undefined || v <= params.max_area)
      );
    });
  }

  // Range filter: outer_diameter
  if (params.min_od !== undefined || params.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (params.min_od === undefined || v >= params.min_od) &&
        (params.max_od === undefined || v <= params.max_od)
      );
    });
  }

  // Generic config-driven enum spec filters
  if (params.spec_filters) {
    for (const [specKey, allowedValues] of Object.entries(params.spec_filters)) {
      if (!allowedValues || allowedValues.length === 0) continue;
      const valueSet = new Set(allowedValues);
      filtered = filtered.filter(c => {
        const values = collectSpecValues(c, specKey);
        return values.some(v => valueSet.has(String(v)));
      });
    }
  }

  // Build facets based on the filtered list
  const filters = buildFacets(filtered, params);

  // Pagination
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const page_size = params.page_size;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  const items: CableListItem[] = paged.map(cable => {
    const brand = api.brands.getById(cable.brand_id);
    const manufacturer = brand ? api.manufacturers.getById(brand.manufacturer_id) : null;
    return { cable, brand, manufacturer };
  });

  return { items, total, page, page_size, filters };
}

/** Build facets for a cable list, driven by the in-scope filter config */
function buildFacets(cableList: Cable[], params: CableQueryParams): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const industryCounts = new Map<Industry, number>();
  // size facet grouped by size_system: Map<size_system, Map<value, count>>
  const sizeCounts = new Map<SizeSystem, Map<string, number>>();
  // generic enum spec facets: Map<spec_key, Map<value, count>>
  const specFacetCounts = new Map<string, Map<string, number>>();
  let minArea = Infinity, maxArea = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  // Determine which enum spec_keys to compute facets for (from in-scope filter config)
  const { industries, typesByIndustry, config } = getInScopeFilterConfig(cableList, params);
  const enumSpecKeys = new Set<string>();
  for (const industry of industries) {
    const indCfg = config[industry];
    if (!indCfg) continue;
    const types = typesByIndustry.get(industry) ?? [];
    for (const t of types) {
      const tCfg = indCfg.types[t];
      if (!tCfg) continue;
      for (const f of tCfg.filters) {
        if (f.control === "enum" && f.spec_key !== "size") {
          enumSpecKeys.add(f.spec_key);
        }
      }
    }
  }

  for (const cable of cableList) {
    // manufacturer + brand
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      brandCounts.set(cable.brand_id, (brandCounts.get(cable.brand_id) ?? 0) + 1);
      manufacturerCounts.set(brand.manufacturer_id, (manufacturerCounts.get(brand.manufacturer_id) ?? 0) + 1);
    }
    // categories
    for (const catId of cable.category_ids) {
      categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
    }
    // industry
    industryCounts.set(cable.industry, (industryCounts.get(cable.industry) ?? 0) + 1);

    // size facet (from variant specs, grouped by cable's size_system)
    if (cable.size_system !== "none") {
      if (!sizeCounts.has(cable.size_system)) sizeCounts.set(cable.size_system, new Map());
      const sizeMap = sizeCounts.get(cable.size_system)!;
      for (const v of cable.variants) {
        for (const s of v.specs) {
          if (s.key === "size") sizeMap.set(String(s.value), (sizeMap.get(String(s.value)) ?? 0) + 1);
        }
      }
    }

    // numeric ranges
    for (const v of cable.variants) {
      for (const s of v.specs) {
        if (s.key === "conductor_area" && typeof s.value === "number") {
          minArea = Math.min(minArea, s.value);
          maxArea = Math.max(maxArea, s.value);
        }
        if (s.key === "outer_diameter" && typeof s.value === "number") {
          minOd = Math.min(minOd, s.value);
          maxOd = Math.max(maxOd, s.value);
        }
      }
    }

    // generic enum spec facets (from common_specs + variant specs)
    if (enumSpecKeys.size > 0) {
      const allSpecs = [...cable.common_specs, ...cable.variants.flatMap(v => v.specs)];
      for (const s of allSpecs) {
        if (enumSpecKeys.has(s.key)) {
          if (!specFacetCounts.has(s.key)) specFacetCounts.set(s.key, new Map());
          const m = specFacetCounts.get(s.key)!;
          m.set(String(s.value), (m.get(String(s.value)) ?? 0) + 1);
        }
      }
    }
  }

  const manufacturers = api.manufacturers.all()
    .map(m => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter(m => m.count > 0);
  const brandsList = api.brands.all()
    .map(b => ({ id: b.id, name: b.name, count: brandCounts.get(b.id) ?? 0 }))
    .filter(b => b.count > 0);
  const categories = api.categories.all()
    .map(c => ({ id: c.id, name: c.name, level: c.level, count: categoryCounts.get(c.id) ?? 0 }))
    .filter(c => c.count > 0);

  // industries facet (ordered by config definition order)
  const allIndustries = api.filterConfig.industries();
  const industriesFacet = allIndustries
    .map(ind => ({
      value: ind,
      label: config[ind]?.label ?? ind,
      count: industryCounts.get(ind) ?? 0,
    }))
    .filter(i => i.count > 0);

  // size facet flattened with size_system tag
  const sizeFacet: { value: string; count: number; size_system: SizeSystem }[] = [];
  for (const [sys, m] of sizeCounts.entries()) {
    for (const [value, count] of m.entries()) {
      sizeFacet.push({ value, count, size_system: sys });
    }
  }

  // generic spec facets
  const spec_facets: Record<string, { value: string; count: number }[]> = {};
  for (const [key, m] of specFacetCounts.entries()) {
    spec_facets[key] = Array.from(m.entries()).map(([value, count]) => ({ value, count }));
  }

  return {
    manufacturers,
    brands: brandsList,
    categories,
    industries: industriesFacet,
    size: sizeFacet,
    spec_facets,
    conductor_area: { min: minArea === Infinity ? 0 : minArea, max: maxArea === -Infinity ? 0 : maxArea },
    outer_diameter: { min: minOd === Infinity ? 0 : minOd, max: maxOd === -Infinity ? 0 : maxOd },
  };
}
