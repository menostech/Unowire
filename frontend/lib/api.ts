import type {
  Brand, Cable, CableDetailResponse, Category,
  Manufacturer, ProductTypeConfig, RecommendedEquipment,
  Taxonomy, TaxonomyCategory, TaxonomyIndustry,
} from './types';

import categoriesData from '@/data/categories.json';

// === API Base URL ===
// Production: empty string → fetch('/api/...') → Nginx reverse proxy
// Local dev: 'http://localhost:8000' → direct FastAPI call
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

// === In-memory cache + ISR ===
const cache = new Map<string, { data: unknown; expires: number }>();

async function fetchWithCache<T>(url: string, ttlMs: number = 60_000): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;
  const cached = cache.get(fullUrl);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const res = await fetch(fullUrl, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText} at ${fullUrl}`);
  const data = await res.json();
  cache.set(fullUrl, { data, expires: Date.now() + ttlMs });
  return data as T;
}

// === Type assertions (legacy — categories only) ===
const categories = categoriesData as Category[];

// === Pre-built indexes (categories only, for legacy redirect) ===
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

// === Adapter functions: API response → frontend types ===
// The API returns snake_case fields; frontend types use snake_case too,
// so most objects pass through directly. These adapters handle
// structural differences (e.g., taxonomy tree shape).

function adaptTaxonomyTree(tree: Record<string, unknown>): Taxonomy {
  // API returns the same structure as taxonomy.json — direct pass-through
  return tree as unknown as Taxonomy;
}

// === URL lookup Map: (brand_slug, cable_slug) → cable ===
// Built on-demand from API data for cables.url() and getCableUrl()

// === Helper functions ===
export function getCableUrl(cable: Cable): string {
  // Brand slug comes from the nested brand object in API responses
  const brandSlug = ((cable as Record<string, unknown>).brand as { slug: string } | undefined)?.slug ?? "unknown";
  return `/cable/${brandSlug}/${cable.slug}`;
}

// === API object ===
export const api = {
  manufacturers: {
    async all(): Promise<Manufacturer[]> {
      const res = await fetchWithCache<{ items: Manufacturer[] }>('/api/manufacturers?page_size=999');
      return res.items;
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        return await fetchWithCache<Manufacturer>(`/api/manufacturers/${id}`);
      } catch {
        return null;
      }
    },
  },

  brands: {
    async all(): Promise<Brand[]> {
      const res = await fetchWithCache<{ items: Brand[] }>('/api/brands?page_size=999');
      return res.items;
    },
    async getById(id: string): Promise<Brand | null> {
      try {
        return await fetchWithCache<Brand>(`/api/brands/${id}`);
      } catch {
        return null;
      }
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
    async all(): Promise<Cable[]> {
      const res = await fetchWithCache<{ items: Cable[] }>('/api/cables?page_size=999');
      return res.items;
    },
    async getById(id: string): Promise<Cable | null> {
      try {
        return await fetchWithCache<Cable>(`/api/cables/${id}`);
      } catch {
        return null;
      }
    },
    async getByUrl(brandSlug: string, cableSlug: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<Record<string, unknown>>(
          `/api/cables/by-url/${brandSlug}/${cableSlug}`
        );
        // Adapt: API returns cable with brand/manufacturer nested objects
        // Frontend Cable type has brand_id, not brand object
        return data as unknown as Cable;
      } catch {
        return null;
      }
    },
    url(cable: Cable): string {
      return getCableUrl(cable);
    },
    async similar(cable: Cable, limit: number = 4): Promise<Cable[]> {
      // Use same-industry cables as similar
      const all = await api.cables.all();
      return all
        .filter(c => c.id !== cable.id && c.industry === cable.industry)
        .slice(0, limit);
    },
  },

  recommendedEquipments: {
    async all(): Promise<RecommendedEquipment[]> {
      const res = await fetchWithCache<{ items: RecommendedEquipment[] }>(
        '/api/recommended-equipments?page_size=999'
      );
      return res.items;
    },
  },

  taxonomy: {
    async all(): Promise<Taxonomy> {
      const tree = await fetchWithCache<Record<string, unknown>>('/api/taxonomy');
      return adaptTaxonomyTree(tree);
    },
    async industries(): Promise<TaxonomyIndustry[]> {
      const tax = await this.all();
      return Object.values(tax);
    },
    async industry(industryKey: string): Promise<TaxonomyIndustry | null> {
      const tax = await this.all();
      return tax[industryKey] ?? null;
    },
    async category(industryKey: string, categoryKey: string): Promise<TaxonomyCategory | null> {
      const ind = await this.industry(industryKey);
      return ind?.categories[categoryKey] ?? null;
    },
    async productType(industryKey: string, categoryKey: string, ptKey: string): Promise<ProductTypeConfig | null> {
      const cat = await this.category(industryKey, categoryKey);
      return cat?.product_types[ptKey] ?? null;
    },
    async industryKeyBySlug(industrySlug: string): Promise<string | null> {
      const tax = await this.all();
      for (const [key, ind] of Object.entries(tax)) {
        if (ind.slug === industrySlug) return key;
      }
      return null;
    },
    async categoryKeyBySlug(industryKey: string, categorySlug: string): Promise<string | null> {
      const ind = await this.industry(industryKey);
      if (!ind) return null;
      for (const [key, cat] of Object.entries(ind.categories)) {
        if (cat.slug === categorySlug) return key;
      }
      return null;
    },
    async productTypeKeyBySlug(industryKey: string, categoryKey: string, ptSlug: string): Promise<string | null> {
      const cat = await this.category(industryKey, categoryKey);
      if (!cat) return null;
      for (const [key, pt] of Object.entries(cat.product_types)) {
        if (pt.slug === ptSlug) return key;
      }
      return null;
    },
    async findBySlug(
      industrySlug: string,
      categorySlug: string,
      productTypeSlug: string
    ): Promise<{
      industry: TaxonomyIndustry;
      category: TaxonomyCategory;
      productType: ProductTypeConfig;
      industryKey: string;
      categoryKey: string;
      productTypeKey: string;
    } | null> {
      const industryKey = await this.industryKeyBySlug(industrySlug);
      if (!industryKey) return null;
      const categoryKey = await this.categoryKeyBySlug(industryKey, categorySlug);
      if (!categoryKey) return null;
      const productTypeKey = await this.productTypeKeyBySlug(industryKey, categoryKey, productTypeSlug);
      if (!productTypeKey) return null;
      const tax = await this.all();
      const industry = tax[industryKey];
      const category = industry.categories[categoryKey];
      const productType = category.product_types[productTypeKey];
      return { industry, category, productType, industryKey, categoryKey, productTypeKey };
    },
  },

  async getCableDetail(brandSlug: string, cableSlug: string): Promise<CableDetailResponse | null> {
    try {
      const data = await fetchWithCache<Record<string, unknown>>(
        `/api/cables/by-url/${brandSlug}/${cableSlug}`
      );
      // The API returns a flat cable detail with brand/manufacturer/equipment nested.
      // Adapt to CableDetailResponse shape.
      const cable = data as unknown as Cable;
      const brand = (data as Record<string, Record<string, unknown>>).brand as Brand | null ?? null;
      const manufacturer = brand
        ? ((data as Record<string, Record<string, unknown>>).manufacturer as Manufacturer | null ?? null)
        : null;
      const cableCategories = cable.category_ids
        ? api.categories.getByIds(cable.category_ids)
        : [];
      const recommendedEquipments = ((data as Record<string, unknown>).recommended_equipments as RecommendedEquipment[]) ?? [];
      return {
        cable,
        brand,
        manufacturer,
        categories: cableCategories,
        recommended_equipments: recommendedEquipments,
      };
    } catch {
      return null;
    }
  },
};
