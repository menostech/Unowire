import type {
  Brand, Cable, CableDetailResponse, Category, Industry, IndustryFilterConfig,
  Manufacturer, RecommendedEquipment, TypeFilterConfig,
} from './types';

import manufacturersData from '@/data/manufacturers.json';
import brandsData from '@/data/brands.json';
import categoriesData from '@/data/categories.json';
import cablesData from '@/data/cables.json';
import recommendedEquipmentsData from '@/data/recommended-equipments.json';
import filterConfigData from '@/data/filter-config.json';

// === Type assertions ===
const manufacturers = manufacturersData as Manufacturer[];
const brands = brandsData as Brand[];
const categories = categoriesData as Category[];
const cables = cablesData as Cable[];
const recommendedEquipments = recommendedEquipmentsData as RecommendedEquipment[];

// === Filter config ===
const filterConfig = filterConfigData as Record<Industry, IndustryFilterConfig>;

// === Pre-built indexes (built on first access) ===
interface CategoryIndex {
  byId: Map<string, Category>;
  children: Map<string, Category[]>;
  descendants: Map<string, Set<string>>;
  ancestors: Map<string, Category[]>;
  pathSlugs: Map<string, string[]>;
  rootCategories: Category[];
}

let _categoryIndex: CategoryIndex | null = null;

function buildCategoryIndex(): CategoryIndex {
  const byId = new Map<string, Category>();
  const children = new Map<string, Category[]>();
  const rootCategories: Category[] = [];

  for (const cat of categories) {
    byId.set(cat.id, cat);
    if (cat.parent_id === null) {
      rootCategories.push(cat);
    } else {
      const arr = children.get(cat.parent_id) ?? [];
      arr.push(cat);
      children.set(cat.parent_id, arr);
    }
  }

  // Recursively find descendants
  const descendants = new Map<string, Set<string>>();
  function getDescendants(catId: string): Set<string> {
    if (descendants.has(catId)) return descendants.get(catId)!;
    const result = new Set<string>();
    const directChildren = children.get(catId) ?? [];
    for (const child of directChildren) {
      result.add(child.id);
      for (const d of getDescendants(child.id)) result.add(d);
    }
    descendants.set(catId, result);
    return result;
  }
  for (const cat of categories) getDescendants(cat.id);

  // Ancestor chain + path slugs
  const ancestors = new Map<string, Category[]>();
  const pathSlugs = new Map<string, string[]>();
  function buildPath(catId: string): { chain: Category[]; slugs: string[] } {
    const cat = byId.get(catId);
    if (!cat) return { chain: [], slugs: [] };
    if (cat.parent_id === null) {
      return { chain: [cat], slugs: [cat.slug] };
    }
    const parent = buildPath(cat.parent_id);
    return { chain: [...parent.chain, cat], slugs: [...parent.slugs, cat.slug] };
  }
  for (const cat of categories) {
    const { chain, slugs } = buildPath(cat.id);
    ancestors.set(cat.id, chain);
    pathSlugs.set(cat.id, slugs);
  }

  return { byId, children, descendants, ancestors, pathSlugs, rootCategories };
}

function getCategoryIndex(): CategoryIndex {
  if (!_categoryIndex) _categoryIndex = buildCategoryIndex();
  return _categoryIndex;
}

// === byId Maps ===
const brandById = new Map(brands.map(b => [b.id, b]));
const manufacturerById = new Map(manufacturers.map(m => [m.id, m]));
const cableById = new Map(cables.map(c => [c.id, c]));

// === URL lookup Map: (brand_slug, cable_slug) → cable ===
const cableByUrl = new Map<string, Cable>();
for (const cable of cables) {
  const brand = brandById.get(cable.brand_id);
  if (brand) {
    cableByUrl.set(`${brand.slug}/${cable.slug}`, cable);
  }
}

// === Helper functions ===
export function getCableUrl(cable: Cable): string {
  const brand = brandById.get(cable.brand_id);
  const brandSlug = brand?.slug ?? "unknown";
  return `/cables/${brandSlug}/${cable.slug}`;
}

// === API object ===
export const api = {
  manufacturers: {
    all(): Manufacturer[] {
      return manufacturers;
    },
    getById(id: string): Manufacturer | null {
      return manufacturerById.get(id) ?? null;
    },
  },

  brands: {
    all(): Brand[] {
      return brands;
    },
    getById(id: string): Brand | null {
      return brandById.get(id) ?? null;
    },
  },

  categories: {
    all(): Category[] {
      return categories;
    },
    roots(): Category[] {
      return getCategoryIndex().rootCategories;
    },
    getById(id: string): Category | null {
      return getCategoryIndex().byId.get(id) ?? null;
    },
    getByIds(ids: string[]): Category[] {
      return ids.map(id => getCategoryIndex().byId.get(id)).filter((c): c is Category => c !== undefined);
    },
    descendants(catId: string): Set<string> {
      return getCategoryIndex().descendants.get(catId) ?? new Set();
    },
    ancestors(catId: string): Category[] {
      return getCategoryIndex().ancestors.get(catId) ?? [];
    },
    pathSlugs(catId: string): string[] {
      return getCategoryIndex().pathSlugs.get(catId) ?? [];
    },
    /** Find category by URL slug path array, return deepest matched category */
    findByPath(slugs: string[]): { category: Category; consumed: number } | null {
      if (slugs.length === 0) return null;
      const idx = getCategoryIndex();
      let currentLevel = idx.rootCategories;
      let matched: Category | null = null;
      let consumed = 0;
      for (const slug of slugs) {
        const found = currentLevel.find(c => c.slug === slug);
        if (!found) break;
        matched = found;
        consumed++;
        currentLevel = idx.children.get(found.id) ?? [];
      }
      return matched ? { category: matched, consumed } : null;
    },
  },

  cables: {
    all(): Cable[] {
      return cables;
    },
    getById(id: string): Cable | null {
      return cableById.get(id) ?? null;
    },
    getByUrl(brandSlug: string, cableSlug: string): Cable | null {
      return cableByUrl.get(`${brandSlug}/${cableSlug}`) ?? null;
    },
    url(cable: Cable): string {
      return getCableUrl(cable);
    },
    /** Get other cables in the same categories (up to limit) */
    similar(cable: Cable, limit: number = 4): Cable[] {
      const catIds = new Set(cable.category_ids);
      return cables
        .filter(c => c.id !== cable.id && c.category_ids.some(id => catIds.has(id)))
        .slice(0, limit);
    },
  },

  recommendedEquipments: {
    all(): RecommendedEquipment[] {
      return recommendedEquipments;
    },
  },

  filterConfig: {
    all(): Record<Industry, IndustryFilterConfig> {
      return filterConfig;
    },
    /** Get the filter config for a specific industry */
    byIndustry(industry: Industry): IndustryFilterConfig | null {
      return filterConfig[industry] ?? null;
    },
    /** Get the filter config for a specific type within an industry */
    byType(industry: Industry, type: string): TypeFilterConfig | null {
      return filterConfig[industry]?.types[type] ?? null;
    },
    /** All known industry values */
    industries(): Industry[] {
      return Object.keys(filterConfig) as Industry[];
    },
    /** All known type values across all industries */
    types(): string[] {
      const all = new Set<string>();
      for (const ind of Object.values(filterConfig)) {
        for (const t of Object.keys(ind.types)) all.add(t);
      }
      return Array.from(all);
    },
  },

  /** All industries that actually appear in the cable data (with counts computed by caller) */
  industriesInData(): Industry[] {
    const set = new Set<Industry>();
    for (const c of cables) set.add(c.industry);
    return Array.from(set);
  },

  /** Detail page aggregated response */
  getCableDetail(brandSlug: string, cableSlug: string): CableDetailResponse | null {
    const cable = this.cables.getByUrl(brandSlug, cableSlug);
    if (!cable) return null;
    const brand = brandById.get(cable.brand_id) ?? null;
    const manufacturer = brand ? manufacturerById.get(brand.manufacturer_id) ?? null : null;
    const cableCategories = this.categories.getByIds(cable.category_ids);
    return {
      cable,
      brand,
      manufacturer,
      categories: cableCategories,
      recommended_equipments: [],  // Filled by equipment-recommend.ts
    };
  },
};
