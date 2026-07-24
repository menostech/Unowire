import type {
  Cable, CableListItem, CableListResponse, CableQueryParams,
  FilterFacets, Manufacturer, SizeSystem, TextSearchParams,
} from './types';
import { api } from './api';

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

/** Parse a size value string to a number for range comparison (mm2/kcmil systems). */
function parseSizeValue(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

/** Apply size filter: enum match OR range match (union for mm2/kcmil; enum only for awg). */
function applySizeFilter(
  cables: Cable[],
  sizeEnum: string[] | undefined,
  minSize: number | undefined,
  maxSize: number | undefined,
  sizeSystem: SizeSystem
): Cable[] {
  if (sizeSystem === "none") return cables;
  const hasEnum = sizeEnum && sizeEnum.length > 0;
  const hasRange = minSize !== undefined || maxSize !== undefined;
  if (!hasEnum && !hasRange) return cables;

  const sizeSet = hasEnum ? new Set(sizeEnum!) : null;

  return cables.filter(c => {
    // Gather all size values from this cable's variants
    const sizeValues: string[] = [];
    for (const v of c.variants) {
      for (const s of v.specs) {
        if (s.key === "size") sizeValues.push(String(s.value));
      }
    }

    // Enum match: any variant's size value is in sizeSet
    if (sizeSet) {
      if (sizeValues.some(v => sizeSet.has(v))) return true;
    }

    // Range match (mm2/kcmil only): any variant's numeric size is in [minSize, maxSize]
    if (hasRange && sizeSystem !== "awg") {
      for (const v of sizeValues) {
        const n = parseSizeValue(v);
        if (n === null) continue;
        if ((minSize === undefined || n >= minSize) && (maxSize === undefined || n <= maxSize)) {
          return true;
        }
      }
    }

    return false;
  });
}

/** Main filter function — route-scoped (industry+category+product_type required). */
export async function filterCables(params: CableQueryParams): Promise<CableListResponse> {
  const { industry, category, product_type, ...filterParams } = params;

  const [allCables, allManufacturers] = await Promise.all([
    api.cables.all(),
    api.manufacturers.all(),
  ]);
  const manufacturerMap = new Map(allManufacturers.map(m => [m.id, m]));

  // 1. Hard filter by route identity
  let filtered = allCables.filter(c =>
    c.industry === industry &&
    c.category === category &&
    c.product_type === product_type
  );

  // 2. Keyword search
  if (filterParams.q) {
    const q = filterParams.q.toLowerCase();
    filtered = filtered.filter(c => {
      if (c.model.toLowerCase().includes(q)) return true;
      if (c.base_description.toLowerCase().includes(q)) return true;
      if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
      if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
      const mfr = manufacturerMap.get(c.manufacturer_id);
      if (mfr && mfr.name.toLowerCase().includes(q)) return true;
      return false;
    });
  }

  // 3. Manufacturer filter
  if (filterParams.manufacturer && filterParams.manufacturer.length > 0) {
    const manufacturerIds = new Set(filterParams.manufacturer);
    filtered = filtered.filter(c => manufacturerIds.has(c.manufacturer_id));
  }

  // 5. Size filter (enum + range union)
  const ptConfig = await api.taxonomy.productType(industry, category, product_type);
  const sizeSystem = ptConfig?.size_system ?? "none";
  filtered = applySizeFilter(
    filtered,
    filterParams.size,
    filterParams.min_size,
    filterParams.max_size,
    sizeSystem
  );

  // 6. Generic config-driven enum spec filters
  if (filterParams.spec_filters) {
    for (const [specKey, allowedValues] of Object.entries(filterParams.spec_filters)) {
      if (!allowedValues || allowedValues.length === 0) continue;
      const valueSet = new Set(allowedValues);
      filtered = filtered.filter(c => {
        const values = collectSpecValues(c, specKey);
        return values.some(v => valueSet.has(String(v)));
      });
    }
  }

  // 7. Range filter: outer_diameter
  if (filterParams.min_od !== undefined || filterParams.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (filterParams.min_od === undefined || v >= filterParams.min_od) &&
        (filterParams.max_od === undefined || v <= filterParams.max_od)
      );
    });
  }

  // 8. Build facets
  const filters = buildFacets(filtered, sizeSystem, allManufacturers);

  // 9. Pagination
  const total = filtered.length;
  const page = Math.max(1, params.page);
  const page_size = params.page_size;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  const items: CableListItem[] = paged.map(cable => {
    const manufacturer = manufacturerMap.get(cable.manufacturer_id) ?? null;
    return { cable, manufacturer };
  });

  return { items, total, page, page_size, filters };
}
/** Cross-industry text search (for /cables overview). No facet filters applied. */
export async function filterCablesByText(params: TextSearchParams): Promise<CableListResponse> {
  const q = params.q.toLowerCase();

  const [allCables, allManufacturers] = await Promise.all([
    api.cables.all(),
    api.manufacturers.all(),
  ]);
  const manufacturerMap = new Map(allManufacturers.map(m => [m.id, m]));

  let filtered = allCables.filter(c => {
    if (c.model.toLowerCase().includes(q)) return true;
    if (c.base_description.toLowerCase().includes(q)) return true;
    if (c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))) return true;
    if (c.common_specs.some(s => String(s.value).toLowerCase().includes(q))) return true;
    const mfr = manufacturerMap.get(c.manufacturer_id);
    if (mfr && mfr.name.toLowerCase().includes(q)) return true;
    return false;
  });

  const total = filtered.length;
  const page = Math.max(1, params.page);
  const page_size = params.page_size;
  const start = (page - 1) * page_size;
  const paged = filtered.slice(start, start + page_size);

  const items: CableListItem[] = paged.map(cable => {
    const manufacturer = manufacturerMap.get(cable.manufacturer_id) ?? null;
    return { cable, manufacturer };
  });

  // Empty facets — overview search has no sidebar
  const filters: FilterFacets = {
    manufacturers: [],
    size: [],
    size_range: null,
    spec_facets: {},
    outer_diameter: null,
  };

  return { items, total, page, page_size, filters };
}

/** Build facets for a route-scoped cable list. */
function buildFacets(
  cableList: Cable[],
  sizeSystem: SizeSystem,
  allManufacturers: Manufacturer[],
): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();
  const specFacetCounts = new Map<string, Map<string, number>>();
  let minSize = Infinity, maxSize = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  // Determine which enum spec_keys to compute facets for (from the fixed product type config)
  // The caller passes sizeSystem; the product type config is looked up by the caller's route.
  // We compute facets for all enum spec_keys that appear in any cable's specs (common + variant)
  // AND is not size/outer_diameter (those have dedicated facet slots).
  const enumSpecKeys = new Set<string>();
  for (const cable of cableList) {
    const allSpecs = [...cable.common_specs, ...cable.variants.flatMap(v => v.specs)];
    for (const s of allSpecs) {
      if (s.key !== "size" && s.key !== "outer_diameter") {
        enumSpecKeys.add(s.key);
      }
    }
  }

  for (const cable of cableList) {
    // manufacturer
    const manufacturerId = cable.manufacturer_id;
    manufacturerCounts.set(manufacturerId, (manufacturerCounts.get(manufacturerId) ?? 0) + 1);

    // size facet + size_range (from variant specs)
    if (sizeSystem !== "none") {
      for (const v of cable.variants) {
        for (const s of v.specs) {
          if (s.key === "size") {
            const valStr = String(s.value);
            sizeCounts.set(valStr, (sizeCounts.get(valStr) ?? 0) + 1);
            const n = parseSizeValue(valStr);
            if (n !== null) {
              minSize = Math.min(minSize, n);
              maxSize = Math.max(maxSize, n);
            }
          }
        }
      }
    }

    // outer_diameter range
    for (const v of cable.variants) {
      for (const s of v.specs) {
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

  const manufacturers = allManufacturers
    .map(m => ({ id: m.id, name: m.name, count: manufacturerCounts.get(m.id) ?? 0 }))
    .filter(m => m.count > 0);

  const sizeFacet: { value: string; count: number }[] = Array.from(sizeCounts.entries())
    .map(([value, count]) => ({ value, count }));

  const size_range = (sizeSystem !== "none" && minSize !== Infinity)
    ? { min: minSize, max: maxSize }
    : null;

  const outer_diameter = (minOd !== Infinity) ? { min: minOd, max: maxOd } : null;

  const spec_facets: Record<string, { value: string; count: number }[]> = {};
  for (const [key, m] of specFacetCounts.entries()) {
    spec_facets[key] = Array.from(m.entries()).map(([value, count]) => ({ value, count }));
  }

  return {
    manufacturers,
    size: sizeFacet,
    size_range,
    spec_facets,
    outer_diameter,
  };
}