import type {
  Brand, Cable, CableListItem, CableListResponse, CableQueryParams,
  Category, FilterFacets, Manufacturer,
} from './types';
import { api } from './api';
import { getDescendantIds } from './category-tree';

/** 从 cable 的 specs 中查找指定 key 的 SpecItem */
function findSpecValue(cable: Cable, key: string): string | number | undefined {
  // 优先从 common_specs 查找，再从各 variant 的 specs 查找
  for (const s of cable.common_specs) {
    if (s.key === key) return s.value;
  }
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) return s.value;
    }
  }
  return undefined;
}

/** 从所有变体收集指定 key 的所有值（去重） */
function collectVariantSpecValues(cable: Cable, key: string): (string | number)[] {
  const values = new Set<string | number>();
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key) values.add(s.value);
    }
  }
  return Array.from(values);
}

/** 获取 cable 的所有数值型 spec 值（跨所有变体） */
function getAllNumericValues(cable: Cable, key: string): number[] {
  const values: number[] = [];
  for (const v of cable.variants) {
    for (const s of v.specs) {
      if (s.key === key && typeof s.value === "number") values.push(s.value);
    }
  }
  return values;
}

/** 主筛选函数 */
export function filterCables(params: CableQueryParams): CableListResponse {
  let filtered = [...api.cables.all()];

  // 关键字搜索
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(c =>
      c.model.toLowerCase().includes(q) ||
      c.base_description.toLowerCase().includes(q) ||
      c.variants.some(v => v.specs.some(s => String(s.value).toLowerCase().includes(q)))
    );
  }

  // 生产商筛选
  if (params.manufacturer && params.manufacturer.length > 0) {
    const manufacturerIds = new Set(params.manufacturer);
    filtered = filtered.filter(c => {
      const brand = api.brands.getById(c.brand_id);
      return brand && manufacturerIds.has(brand.manufacturer_id);
    });
  }

  // 品牌筛选
  if (params.brand && params.brand.length > 0) {
    const brandIds = new Set(params.brand);
    filtered = filtered.filter(c => brandIds.has(c.brand_id));
  }

  // 分类筛选（含子孙）
  if (params.category && params.category.length > 0) {
    const allCatIds = new Set<string>();
    for (const catId of params.category) {
      for (const d of getDescendantIds(catId)) allCatIds.add(d);
    }
    filtered = filtered.filter(c => c.category_ids.some(id => allCatIds.has(id)));
  }

  // AWG 筛选（任一变体匹配）
  if (params.awg && params.awg.length > 0) {
    const awgSet = new Set(params.awg);
    filtered = filtered.filter(c =>
      c.variants.some(v => v.specs.some(s => s.key === "awg" && awgSet.has(String(s.value))))
    );
  }

  // 数值范围筛选：conductor_area（任一变体在范围内）
  if (params.min_area !== undefined || params.max_area !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "conductor_area");
      return values.some(v =>
        (params.min_area === undefined || v >= params.min_area) &&
        (params.max_area === undefined || v <= params.max_area)
      );
    });
  }

  // 数值范围筛选：outer_diameter
  if (params.min_od !== undefined || params.max_od !== undefined) {
    filtered = filtered.filter(c => {
      const values = getAllNumericValues(c, "outer_diameter");
      return values.some(v =>
        (params.min_od === undefined || v >= params.min_od) &&
        (params.max_od === undefined || v <= params.max_od)
      );
    });
  }

  // 枚举筛选：shielding
  if (params.shielding && params.shielding.length > 0) {
    const set = new Set(params.shielding);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "shielding"))));
  }

  // 枚举筛选：jacket
  if (params.jacket && params.jacket.length > 0) {
    const set = new Set(params.jacket);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "jacket"))));
  }

  // 枚举筛选：core_structure
  if (params.core_structure && params.core_structure.length > 0) {
    const set = new Set(params.core_structure);
    filtered = filtered.filter(c => set.has(String(findSpecValue(c, "core_structure"))));
  }

  // 构建 facets（基于筛选后的结果）
  const filters = buildFacets(filtered);

  // 分页
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

/** 构建 facets（基于给定 cable 列表） */
function buildFacets(cableList: Cable[]): FilterFacets {
  const manufacturerCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const awgCounts = new Map<string, number>();
  const shieldingCounts = new Map<string, number>();
  const jacketCounts = new Map<string, number>();
  const coreCounts = new Map<string, number>();
  let minArea = Infinity, maxArea = -Infinity;
  let minOd = Infinity, maxOd = -Infinity;

  for (const cable of cableList) {
    // manufacturer
    const brand = api.brands.getById(cable.brand_id);
    if (brand) {
      brandCounts.set(cable.brand_id, (brandCounts.get(cable.brand_id) ?? 0) + 1);
      manufacturerCounts.set(brand.manufacturer_id, (manufacturerCounts.get(brand.manufacturer_id) ?? 0) + 1);
    }
    // categories
    for (const catId of cable.category_ids) {
      categoryCounts.set(catId, (categoryCounts.get(catId) ?? 0) + 1);
    }
    // variant specs
    for (const v of cable.variants) {
      for (const s of v.specs) {
        if (s.key === "awg") awgCounts.set(String(s.value), (awgCounts.get(String(s.value)) ?? 0) + 1);
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
    // common specs
    for (const s of cable.common_specs) {
      if (s.key === "shielding") shieldingCounts.set(String(s.value), (shieldingCounts.get(String(s.value)) ?? 0) + 1);
      if (s.key === "jacket") jacketCounts.set(String(s.value), (jacketCounts.get(String(s.value)) ?? 0) + 1);
      if (s.key === "core_structure") coreCounts.set(String(s.value), (coreCounts.get(String(s.value)) ?? 0) + 1);
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

  return {
    manufacturers,
    brands: brandsList,
    categories,
    awg: Array.from(awgCounts.entries()).map(([value, count]) => ({ value, count })),
    conductor_area: { min: minArea === Infinity ? 0 : minArea, max: maxArea === -Infinity ? 0 : maxArea },
    outer_diameter: { min: minOd === Infinity ? 0 : minOd, max: maxOd === -Infinity ? 0 : maxOd },
    shielding: Array.from(shieldingCounts.entries()).map(([value, count]) => ({ value, count })),
    jacket: Array.from(jacketCounts.entries()).map(([value, count]) => ({ value, count })),
    core_structure: Array.from(coreCounts.entries()).map(([value, count]) => ({ value, count })),
  };
}
