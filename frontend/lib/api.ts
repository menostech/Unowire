import type {
  ApplicableSpecRule, Cable, CableDetailResponse, Category,
  EquipmentManufacturer, EquipmentCategory,
  Industry, Manufacturer, Plan, ProductTypeConfig, RecommendedEquipment,
  SizeSystem, SpecItem, SpecType, Taxonomy, TaxonomyCategory,
  TaxonomyIndustry,
  Terminal, TerminalCategory, TerminalManufacturer,
} from './types';

import categoriesData from '@/data/categories.json';

import { cache } from 'react';

// === API Base URL ===
// Server-side: use internal URL (set in Docker env) for absolute fetch
// Client-side: NEXT_PUBLIC_API_BASE (empty in production for same-origin browser requests)
// Local dev: NEXT_PUBLIC_API_BASE=http://localhost:8000
const API_BASE = process.env.NEXT_PUBLIC_API_BASE
  || (typeof window === 'undefined' ? process.env.INTERNAL_API_BASE || 'http://backend:8000' : '');

// === In-memory cache + ISR ===
const responseCache = new Map<string, { data: unknown; expires: number }>();

async function fetchWithCache<T>(url: string, ttlMs: number = 60_000): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;
  const cached = responseCache.get(fullUrl);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const res = await fetch(fullUrl, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText} at ${fullUrl}`);
  const data = await res.json();
  responseCache.set(fullUrl, { data, expires: Date.now() + ttlMs });
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
  manufacturer_id: string;
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: string;
  base_description: string | null;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  category_ids?: string[];
  manufacturer?: BackendManufacturer | null;
  common_specs?: BackendSpecItem[];
  variants?: { slug: string; specs: BackendSpecItem[]; sort_order?: number; id?: number }[];
}

interface BackendManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  featured_cable_ids: string[];
  featured_image: boolean;
  featured_image_sort: number;
  featured_text: boolean;
  featured_text_sort: number;
}

interface BackendEquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BackendEquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  children: BackendEquipmentCategory[];
}

interface BackendEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: ApplicableSpecRule[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: BackendEquipmentManufacturer | null;
  category: { id: string; parent_id: string | null; label: string; slug: string; description: string | null; image_url: string | null } | null;
}

interface BackendTerminalManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BackendTerminalCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  children: BackendTerminalCategory[];
}

interface BackendTerminal {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: ApplicableSpecRule[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: BackendTerminalManufacturer | null;
  category: { id: string; parent_id: string | null; label: string; slug: string; description: string | null; image_url: string | null } | null;
}

interface BackendResource {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  description: string | null;
  file_filename: string | null;
  file_content_type: string | null;
  file_size_bytes: number | null;
  file_url_path: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  scope_type: string | null;
  scope_id: string | null;
  download_count: number;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  category?: BackendResourceCategory | null;
}

interface BackendResourceCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  children?: BackendResourceCategory[];
}

interface BackendResourceListResponse {
  items: BackendResource[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendPost {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: string;
  is_visible: boolean;
  sort_order: number;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
  category?: BackendPostCategory | null;
}

export interface BackendPostCategory {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BackendPostListResponse {
  items: BackendPost[];
  total: number;
  page: number;
  page_size: number;
}

interface BackendCableListResponse {
  items: BackendCable[];
  total: number;
  page: number;
  page_size: number;
  facets: {
    manufacturers: { id: string; name: string; count: number }[];
    size: { value: string; count: number }[];
    size_range: { min: number; max: number } | null;
    spec_facets: Record<string, { value: string; count: number }[]>;
    outer_diameter: { min: number; max: number } | null;
  };
}

interface BackendPlan {
  id: number;
  name: string;
  tier_level: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  search_limit_daily: number;
  detail_view_limit_daily: number;
  download_limit_monthly: number;
  is_sales_led: boolean;
  is_active: boolean;
  features: string[];
  sort_order: number;
  trial_days: number;
}

// === Adapter functions: API response -> frontend types ===
// The backend returns different field names than frontend types expect
// (e.g., industry_id vs industry, spec_key/value_string vs key/value).
// These adapters normalize the backend responses into frontend types.

function adaptTaxonomyTree(data: unknown): Taxonomy {
  // Backend returns an array of industries with array-valued categories/product_types.
  // Frontend expects Record<string, Industry> keyed by id, with Record-valued children.
  const arr = data as Array<{
    id: string;
    label: string;
    slug: string;
    description: string;
    image_url: string | null;
    categories: Array<{
      id: string;
      label: string;
      slug: string;
      image_url: string | null;
      product_types: Array<{
        id: string;
        label: string;
        slug: string;
        size_system: string;
        image_url: string | null;
        filters: Array<{ spec_key: string; label: string; control: string; unit: string | null }>;
      }>;
    }>;
  }>;
  const result: Record<string, unknown> = {};
  for (const ind of arr) {
    const categories: Record<string, unknown> = {};
    for (const cat of ind.categories) {
      const pts: Record<string, unknown> = {};
      for (const pt of cat.product_types) {
        const ptKey = pt.id.split('/').pop()!;
        pts[ptKey] = {
          label: pt.label,
          slug: pt.slug,
          size_system: pt.size_system,
          filters: pt.filters,
          image_url: pt.image_url ?? null,
        };
      }
      const catKey = cat.id.split('/').pop()!;
      categories[catKey] = {
        label: cat.label,
        slug: cat.slug,
        product_types: pts,
        image_url: cat.image_url ?? null,
      };
    }
    result[ind.id] = {
      label: ind.label,
      slug: ind.slug,
      description: ind.description,
      categories,
      image_url: ind.image_url ?? null,
    };
  }
  return result as unknown as Taxonomy;
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
    manufacturer_id: c.manufacturer_id,
    model: c.model,
    slug: c.slug,
    type: c.product_type_id,
    industry: c.industry_id as Industry,
    category: c.category_id?.split('/').pop() ?? '',
    product_type: c.product_type_id?.split('/').pop() ?? '',
    size_system: c.size_system as SizeSystem,
    category_ids: c.category_ids ?? [],
    base_description: c.base_description ?? '',
    meta_title: c.meta_title,
    meta_description: c.meta_description,
    image_url: c.image_url,
    common_specs: (c.common_specs ?? []).map(adaptSpecItem),
    variants: (c.variants ?? []).map(v => ({
      slug: v.slug,
      specs: (v.specs ?? []).map(adaptSpecItem),
    })),
  };
  // Attach manufacturer slug for getCableUrl (not part of Cable type)
  if (c.manufacturer) {
    (cable as Cable & { manufacturer?: { slug: string } }).manufacturer = { slug: c.manufacturer.slug };
  }
  return cable;
}

function adaptManufacturer(m: BackendManufacturer): Manufacturer {
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? '',
    website: m.website ?? '',
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    featured_cable_ids: m.featured_cable_ids ?? [],
    featured_image: m.featured_image ?? false,
    featured_image_sort: m.featured_image_sort ?? 0,
    featured_text: m.featured_text ?? false,
    featured_text_sort: m.featured_text_sort ?? 0,
  };
}

function adaptEquipmentManufacturer(m: BackendEquipmentManufacturer | null | undefined): EquipmentManufacturer | null {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? null,
    website: m.website ?? null,
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    sort_order: m.sort_order ?? 0,
    created_at: m.created_at ?? '',
    updated_at: m.updated_at ?? '',
  };
}

function adaptEquipmentCategory(c: BackendEquipmentCategory | null | undefined): EquipmentCategory | null {
  if (!c) return null;
  return {
    id: c.id,
    parent_id: c.parent_id ?? null,
    label: c.label,
    slug: c.slug,
    description: c.description ?? null,
    image_url: c.image_url ?? null,
    children: (c.children ?? []).map(child => adaptEquipmentCategory(child)!),
  };
}

function adaptEquipment(e: BackendEquipment): RecommendedEquipment {
  return {
    id: e.id,
    manufacturer_id: e.manufacturer_id,
    category_id: e.category_id,
    model: e.model,
    slug: e.slug,
    applicable_specs: e.applicable_specs ?? [],
    description: e.description ?? null,
    image_url: e.image_url ?? null,
    external_url: e.external_url ?? null,
    sort_order: e.sort_order ?? 0,
    manufacturer: adaptEquipmentManufacturer(e.manufacturer),
    category: e.category ? {
      id: e.category.id,
      parent_id: e.category.parent_id,
      label: e.category.label,
      slug: e.category.slug,
      description: e.category.description,
      image_url: e.category.image_url,
      children: [],
    } : null,
  };
}

function adaptTerminalManufacturer(m: BackendTerminalManufacturer | null | undefined): TerminalManufacturer | null {
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    slug: m.slug,
    country: m.country ?? null,
    website: m.website ?? null,
    image_url: m.image_url ?? null,
    description: m.description ?? null,
    founded_year: m.founded_year ?? null,
    address: m.address ?? null,
    phone: m.phone ?? null,
    email: m.email ?? null,
    sort_order: m.sort_order ?? 0,
    created_at: m.created_at ?? '',
    updated_at: m.updated_at ?? '',
  };
}

function adaptTerminalCategory(c: BackendTerminalCategory | null | undefined): TerminalCategory | null {
  if (!c) return null;
  return {
    id: c.id,
    parent_id: c.parent_id ?? null,
    label: c.label,
    slug: c.slug,
    description: c.description ?? null,
    image_url: c.image_url ?? null,
    children: (c.children ?? []).map(child => adaptTerminalCategory(child)!),
  };
}

function adaptTerminal(e: BackendTerminal): Terminal {
  return {
    id: e.id,
    manufacturer_id: e.manufacturer_id,
    category_id: e.category_id,
    model: e.model,
    slug: e.slug,
    applicable_specs: e.applicable_specs ?? [],
    description: e.description ?? null,
    image_url: e.image_url ?? null,
    external_url: e.external_url ?? null,
    sort_order: e.sort_order ?? 0,
    manufacturer: adaptTerminalManufacturer(e.manufacturer),
    category: e.category ? {
      id: e.category.id,
      parent_id: e.category.parent_id,
      label: e.category.label,
      slug: e.category.slug,
      description: e.category.description,
      image_url: e.category.image_url,
      children: [],
    } : null,
  };
}

// === Helper functions ===
export function getCableUrl(cable: Cable): string {
  const manufacturerSlug = (cable as unknown as Record<string, unknown>).manufacturer_slug as string | undefined;
  if (manufacturerSlug) return `/cable/${manufacturerSlug}/${cable.slug}`;
  const manufacturer = (cable as unknown as Record<string, unknown>).manufacturer as { slug: string } | undefined;
  return `/cable/${manufacturer?.slug ?? 'unknown'}/${cable.slug}`;
}

// === API object ===
export const api = {
  manufacturers: {
    all: cache(async (): Promise<Manufacturer[]> => {
      const res = await fetchWithCache<{ items: BackendManufacturer[] }>('/api/manufacturers?page_size=999');
      return res.items.map(adaptManufacturer);
    }),
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
    async getBySlug(slug: string): Promise<Manufacturer | null> {
      try {
        const data = await fetchWithCache<BackendManufacturer>(`/api/manufacturers/slug/${slug}`);
        return adaptManufacturer(data);
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
    all: cache(async (): Promise<Cable[]> => {
      const res = await fetchWithCache<BackendCableListResponse>('/api/cables?page_size=999');
      return res.items.map(c => {
        const adapted = adaptCable(c);
        (adapted as unknown as Record<string, unknown>).manufacturer_slug = c.manufacturer?.slug ?? 'unknown';
        return adapted;
      });
    }),
    async getById(id: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<BackendCable>(`/api/cables/${id}`);
        return adaptCable(data);
      } catch {
        return null;
      }
    },
    async getByUrl(manufacturerSlug: string, cableSlug: string): Promise<Cable | null> {
      try {
        const data = await fetchWithCache<BackendCable>(
          `/api/cables/by-url/${manufacturerSlug}/${cableSlug}`
        );
        const adapted = adaptCable(data);
        (adapted as unknown as Record<string, unknown>).manufacturer_slug = data.manufacturer?.slug ?? manufacturerSlug;
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
    async byCable(cableId: string): Promise<RecommendedEquipment[]> {
      const res = await fetchWithCache<{ items: BackendEquipment[] }>(
        `/api/recommended-equipments?cable_id=${encodeURIComponent(cableId)}`
      );
      return res.items.map(adaptEquipment);
    },
  },

  equipmentManufacturers: {
    async all(): Promise<EquipmentManufacturer[]> {
      const res = await fetchWithCache<{ items: BackendEquipmentManufacturer[]; total: number; page: number; page_size: number }>(
        '/api/equipment-manufacturers?page_size=999'
      );
      return (res.items ?? []).map(adaptEquipmentManufacturer).filter((m): m is EquipmentManufacturer => m !== null);
    },
    async getById(id: string): Promise<EquipmentManufacturer | null> {
      try {
        const data = await fetchWithCache<BackendEquipmentManufacturer>(`/api/equipment-manufacturers/${encodeURIComponent(id)}`);
        return adaptEquipmentManufacturer(data);
      } catch {
        return null;
      }
    },
    async getBySlug(slug: string): Promise<EquipmentManufacturer | null> {
      const all = await this.all();
      return all.find((m) => m.slug === slug) ?? null;
    },
  },

  equipmentCategories: {
    async tree(): Promise<EquipmentCategory[]> {
      const data = await fetchWithCache<BackendEquipmentCategory[]>('/api/equipment-categories');
      return (data ?? []).map(c => adaptEquipmentCategory(c)!).filter((c): c is EquipmentCategory => c !== null);
    },
    async getById(id: string): Promise<EquipmentCategory | null> {
      try {
        const data = await fetchWithCache<BackendEquipmentCategory>(`/api/equipment-categories/${encodeURIComponent(id)}`);
        return adaptEquipmentCategory(data);
      } catch {
        return null;
      }
    },
  },

  connectivity: {
    async all(): Promise<Terminal[]> {
      const res = await fetchWithCache<{ items: BackendTerminal[] }>(
        '/api/connectivity?page_size=999'
      );
      return res.items.map(adaptTerminal);
    },
    async byCable(cableId: string): Promise<Terminal[]> {
      const res = await fetchWithCache<{ items: BackendTerminal[] }>(
        `/api/connectivity?cable_id=${encodeURIComponent(cableId)}`
      );
      return res.items.map(adaptTerminal);
    },
    async getBySlug(slug: string): Promise<Terminal | null> {
      try {
        const data = await fetchWithCache<BackendTerminal>(`/api/connectivity/${encodeURIComponent(slug)}`);
        return adaptTerminal(data);
      } catch {
        return null;
      }
    },
  },

  connectivityManufacturers: {
    async all(): Promise<TerminalManufacturer[]> {
      const res = await fetchWithCache<{ items: BackendTerminalManufacturer[]; total: number; page: number; page_size: number }>(
        '/api/connectivity-manufacturers?page_size=999'
      );
      return (res.items ?? []).map(adaptTerminalManufacturer).filter((m): m is TerminalManufacturer => m !== null);
    },
    async getById(id: string): Promise<TerminalManufacturer | null> {
      try {
        const data = await fetchWithCache<BackendTerminalManufacturer>(`/api/connectivity-manufacturers/${encodeURIComponent(id)}`);
        return adaptTerminalManufacturer(data);
      } catch {
        return null;
      }
    },
    async getBySlug(slug: string): Promise<TerminalManufacturer | null> {
      const all = await this.all();
      return all.find((m) => m.slug === slug) ?? null;
    },
  },

  connectivityCategories: {
    async tree(): Promise<TerminalCategory[]> {
      const data = await fetchWithCache<BackendTerminalCategory[]>('/api/connectivity-categories');
      return (data ?? []).map(c => adaptTerminalCategory(c)!).filter((c): c is TerminalCategory => c !== null);
    },
    async getById(id: string): Promise<TerminalCategory | null> {
      try {
        const data = await fetchWithCache<BackendTerminalCategory>(`/api/connectivity-categories/${encodeURIComponent(id)}`);
        return adaptTerminalCategory(data);
      } catch {
        return null;
      }
    },
  },

  resourceCategories: {
    async tree(): Promise<BackendResourceCategory[]> {
      const data = await fetchWithCache<BackendResourceCategory[]>('/api/resource-categories');
      return data ?? [];
    },
    async flat(): Promise<BackendResourceCategory[]> {
      const data = await fetchWithCache<BackendResourceCategory[]>('/api/resource-categories/flat');
      return data ?? [];
    },
  },

  resources: {
    async all(params?: { page?: number; page_size?: number; category_id?: string; q?: string }): Promise<BackendResourceListResponse> {
      const qs = new URLSearchParams();
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.page_size != null) qs.set('page_size', String(params.page_size));
      if (params?.category_id) qs.set('category_id', params.category_id);
      if (params?.q) qs.set('q', params.q);
      const suffix = qs.toString() ? `?${qs}` : '';
      return fetchWithCache<BackendResourceListResponse>(`/api/resources${suffix}`);
    },
    async getBySlug(slug: string): Promise<BackendResource | null> {
      try {
        return await fetchWithCache<BackendResource>(`/api/resources/${encodeURIComponent(slug)}`);
      } catch {
        return null;
      }
    },
  },

  postCategories: {
    async all(): Promise<BackendPostCategory[]> {
      const data = await fetchWithCache<BackendPostCategory[]>('/api/post-categories');
      return data ?? [];
    },
  },

  posts: {
    async all(params?: { page?: number; page_size?: number; category_slug?: string; q?: string }): Promise<BackendPostListResponse> {
      const qs = new URLSearchParams();
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.page_size != null) qs.set('page_size', String(params.page_size));
      if (params?.category_slug) qs.set('category_slug', params.category_slug);
      if (params?.q) qs.set('q', params.q);
      const suffix = qs.toString() ? `?${qs}` : '';
      return fetchWithCache<BackendPostListResponse>(`/api/posts${suffix}`);
    },
    async getByCategoryAndSlug(categorySlug: string, postSlug: string): Promise<BackendPost | null> {
      try {
        return await fetchWithCache<BackendPost>(`/api/posts/${encodeURIComponent(categorySlug)}/${encodeURIComponent(postSlug)}`);
      } catch {
        return null;
      }
    },
  },

  taxonomy: {
    all: cache(async (): Promise<Taxonomy> => {
      const tree = await fetchWithCache<unknown>('/api/taxonomy');
      return adaptTaxonomyTree(tree);
    }),
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

  plans: {
    async all(): Promise<Plan[]> {
      const res = await fetchWithCache<BackendPlan[]>('/api/plans');
      return res.map(p => ({ ...p }));
    },
  },

  async getCableDetail(manufacturerSlug: string, cableSlug: string): Promise<CableDetailResponse | null> {
    try {
      const data = await fetchWithCache<BackendCable & {
        manufacturer: BackendManufacturer | null;
        recommended_equipments: BackendEquipment[];
      }>(`/api/cables/by-url/${manufacturerSlug}/${cableSlug}`);
      const cable = adaptCable(data);
      const manufacturer = data.manufacturer ? adaptManufacturer(data.manufacturer) : null;
      const cableCategories = cable.category_ids ? api.categories.getByIds(cable.category_ids) : [];
      const recommendedEquipments = (data.recommended_equipments ?? []).map(e => {
        const equipment = adaptEquipment(e);
        return { equipment, matched_variants: [], explanation: [] };
      });
      return { cable, manufacturer, categories: cableCategories, recommended_equipments: recommendedEquipments };
    } catch {
      return null;
    }
  },

  // === Deprecated aliases — prefer `api.connectivity*` ===
  // These getters exist for backward compatibility with callers that still
  // use the historical `terminals` / `terminalManufacturers` /
  // `terminalCategories` property names. They return the same namespace
  // objects as the new names.
  get terminals() {
    return this.connectivity;
  },
  get terminalManufacturers() {
    return this.connectivityManufacturers;
  },
  get terminalCategories() {
    return this.connectivityCategories;
  },
};