import type {
  ApplicableSpecRule, Brand, Cable, CableDetailResponse, Category,
  Industry, Manufacturer, ProductTypeConfig, RecommendedEquipment,
  SizeSystem, SpecItem, SpecType, Taxonomy, TaxonomyCategory,
  TaxonomyIndustry,
} from './types';

import categoriesData from '@/data/categories.json';

// === API Base URL ===
// Server-side: use internal URL (set in Docker env) for absolute fetch
// Client-side: NEXT_PUBLIC_API_BASE (empty in production for same-origin browser requests)
// Local dev: NEXT_PUBLIC_API_BASE=http://localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_BASE
  || (typeof window === 'undefined' ? process.env.INTERNAL_API_BASE || 'http://backend:8000' : '');

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

// === Backend response interfaces (not exported, internal use) ===
interface BackendSpecItem {
  spec_key: string;
  label: string;
  value_string: string | null;
  value_number: number | null;
  unit: string | null;
  spec_type: string;
  filterable: boolean;
  sort_order?: number;
}

interface BackendCable {
  id: string;
  brand_id: string;
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: string;
  base_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  category_ids?: string[];
  brand?: BackendBrand | null;
  common_specs?: BackendSpecItem[];
  variants?: { slug: string; specs: BackendSpecItem[]; sort_order?: number; id?: number }[];
}

interface BackendBrand {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  manufacturer?: { id: string; name: string; slug: string; country: string | null; website: string | null } | null;
}

interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
}

interface BackendEquipment {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  external_url: string | null;
  applicable_specs: Record<string, unknown>[];
  description: string | null;
}

interface BackendCableListResponse {
  items: BackendCable[];
  total: number;
  page: number;
  page_size: number;
  facets: {
    manufacturers: { id: string; name: string; count: number }[];
    brands: { id: string; name: string; count: number }[];
    size: { value: string; count: number }[];
    size_range: { min: number; max: number } | null;
    spec_facets: Record<string, { value: string; count: number }[]>;
    outer_diameter: { min: number; max: number } | null;
  };
}

// === Adapter functions: API response -> frontend types ===
// The backend returns different field names than frontend types expect
// (e.g., industry_id vs industry, spec_key/value_string vs key/value).
// These adapters normalize the backend responses into frontend types.

function adaptTaxonomyTree(tree: Record<string, unknown>): Taxonomy {
  // API returns the same structure as taxonomy.json — direct pass-through
  return tree as unknown as Taxonomy;
}
function adaptSpecItem(s: BackendSpecItem): SpecItem {
  return {
    key: s.spec_key,
    label: s.label,
    value: s.value_number !== null && s.value_number !== undefined ? s.value_number : (s.value_string ?? ''),
    unit: s.unit,
    type: s.spec_type as SpecType,
    filterable: s.filterable,
  };
}

function adaptCable(c: BackendCable): Cable {
  const cable: Cable = {
    id: c.id,
    brand_id: c.brand_id,
    model: c.model,
    slug: c.slug,
    type: c.product_type_id,
    industry: c.industry_id as Industry,
    category: c.category_id,
    product_type: c.product_type_id,
    size_system: c.size_system as SizeSystem,
    category_ids: c.category_ids ?? [],
    base_description: c.base_description ?? '',
    meta_title: c.meta_title,
    meta_description: c.meta_description,
    common_specs: (c.common_specs ?? []).map(adaptSpecItem),
    variants: (c.variants ?? []).map(v => ({
      slug: v.slug,
      specs: (v.specs ?? []).map(adaptSpecItem),
    })),
  };
  // Preserve brand slug for getCableUrl (attached as extra property, not in Cable type)
  if (c.brand) {
    (cable as Cable & { brand?: { slug: string } }).brand = { slug: c.brand.slug };
  }
  return cable;
}

function adaptBrand(b: BackendBrand): Brand {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    manufacturer_id: b.manufacturer_id,
    country: b.manufacturer?.country ?? '',
    website: b.manufacturer?.website ?? '',
  };
}

function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? '',
    website: m.website ?? '',
  };
}

function adaptEquipment(e: BackendEquipment): RecommendedEquipment {
  return {
    id: e.id,
    brand: e.brand ?? '',
    model: e.model ?? e.name,
    type: e.type ?? '',
    description: e.description ?? '',
    applicable_specs: (e.applicable_specs ?? []) as unknown as ApplicableSpecRule[],
    external_url: e.external_url ?? '',
  };
}

// === Helper functions ===
export function getCableUrl(cable: Cable): string {
  const brandSlug = (cable as unknown as Record<string, unknown>).brand_slug as string | undefined;
  if (brandSlug) return `/cable/${brandSlug}/${cable.slug}`;
  // Fallback: try nested brand object (attached by adaptCable for detail page)
  const brand = (cable as unknown as Record<string, unknown>).brand as { slug: string } | undefined;
  return `/cable/${brand?.slug ?? 'unknown'}/${cable.slug}`;
}

// === API object ===
export const api = {
  manufacturers: {
    async all(): Promise<Manufacturer[]> {
      const res = await fetchWithCache<{ items: BackendManufacturer[] }>('/api/manufacturers?page_size=999');
      return res.items.map(adaptManufacturer);
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
  },

  brands: {
    async all(): Promise<Brand[]> {
      const res = await fetchWithCache<{ items: BackendBrand[] }>('/api/brands?page_size=999');
      return res.items.map(adaptBrand);
    },
    async getById(id: string): Promise<Brand | null> {
      try {
        const data = await fetchWithCache<BackendBrand>(`/api/brands/${id}`);
        return adaptBrand(data);
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
      const res = await fetchWithCache<BackendCableListResponse>('/api/cables?page_size=999');
      return res.items.map(c => {
        const adapted = adaptCable(c);
        // Attach brand slug for getCableUrl (not part of Cable type)
        (adapted as unknown as Record<string, unknown>).brand_slug = c.brand?.slug ?? 'unknown';
        return adapted;
      });
    },
    async getById(id: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<BackendCable>(`/api/cables/${id}`);
        return adaptCable(data);
      } catch {
        return null;
      }
    },
    async getByUrl(brandSlug: string, cableSlug: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<BackendCable>(
          `/api/cables/by-url/${brandSlug}/${cableSlug}`
        );
        const adapted = adaptCable(data);
        // Attach brand slug for getCableUrl (not part of Cable type)
        (adapted as unknown as Record<string, unknown>).brand_slug = data.brand?.slug ?? brandSlug;
        return adapted;
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
      const res = await fetchWithCache<{ items: BackendEquipment[] }>(
        '/api/recommended-equipments?page_size=999'
      );
      return res.items.map(adaptEquipment);
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
      const data = await fetchWithCache<BackendCable & {
        manufacturer: BackendManufacturer | null;
        recommended_equipments: BackendEquipment[];
      }>(`/api/cables/by-url/${brandSlug}/${cableSlug}`);
      const cable = adaptCable(data);
      const brand = data.brand ? adaptBrand(data.brand) : null;
      const manufacturer = data.manufacturer ? adaptManufacturer(data.manufacturer) : null;
      const cableCategories = cable.category_ids ? api.categories.getByIds(cable.category_ids) : [];
      const recommendedEquipments = (data.recommended_equipments ?? []).map(e => {
        const equipment = adaptEquipment(e);
        return {
          equipment,
          matched_variants: [],
          explanation: [],
        };
      });
      return { cable, brand, manufacturer, categories: cableCategories, recommended_equipments: recommendedEquipments };
    } catch {
      return null;
    }
  },
};