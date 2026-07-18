import { cookies } from 'next/headers';
import type { Manufacturer, Brand, Cable, MenuItem, MenuItemTree, Role, AdminUserExtended, UserPermissions, ScopeOption, AdminMember, Page, PageListItem } from './types';
import type { AdminModule } from './adminModules';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

// === Backend response shapes (raw, un-adapted) ===
// Admin pages edit raw backend data, so we keep the original field names
// (spec_key/value_string/etc.) to enable round-tripping through the JSON editors.
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

interface BackendBrand {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  manufacturer?: BackendManufacturer | null;
  image_url: string | null;
}

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

interface BackendCableVariant {
  slug: string;
  specs: BackendSpecItem[];
  sort_order?: number;
  id?: number;
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
  image_url: string | null;
  category_ids?: string[];
  brand?: BackendBrand | null;
  common_specs?: BackendSpecItem[];
  variants?: BackendCableVariant[];
}

interface BackendTaxonomyFilter {
  spec_key: string;
  label: string;
  control: string;
  unit: string | null;
}

interface BackendIndustry {
  id: string;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  categories?: BackendCategory[];
  image_url: string | null;
}

interface BackendCategory {
  id: string;
  industry_id: string;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  product_types?: BackendProductType[];
  image_url: string | null;
}

interface BackendProductType {
  id: string;
  category_id: string;
  label: string;
  slug: string;
  size_system: string;
  filters: BackendTaxonomyFilter[];
  sort_order: number;
  image_url: string | null;
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
}

interface BackendEquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  // Present on tree endpoints (list/get), absent on flat reads (POST/PUT/nested)
  children?: BackendEquipmentCategory[];
}

interface BackendEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: Record<string, unknown>[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: BackendEquipmentManufacturer | null;
  category: BackendEquipmentCategory | null;
}

interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  facets?: unknown;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
}

// === Adapters to frontend types (for display-only getters) ===
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

function adaptBrand(b: BackendBrand): Brand {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    manufacturer_id: b.manufacturer_id,
    country: b.manufacturer?.country ?? '',
    website: b.manufacturer?.website ?? '',
    image_url: b.image_url,
  };
}

function adaptSpecItem(s: BackendSpecItem) {
  return {
    key: s.spec_key,
    label: s.label,
    value: s.value_number !== null && s.value_number !== undefined ? s.value_number : (s.value_string ?? ''),
    unit: s.unit,
    type: s.spec_type as Cable['common_specs'][number]['type'],
    filterable: s.filterable,
  };
}

function adaptCable(c: BackendCable): Cable {
  return {
    id: c.id,
    brand_id: c.brand_id,
    model: c.model,
    slug: c.slug,
    type: c.product_type_id,
    industry: c.industry_id as Cable['industry'],
    category: c.category_id?.split('/').pop() ?? '',
    product_type: c.product_type_id?.split('/').pop() ?? '',
    size_system: c.size_system as Cable['size_system'],
    category_ids: c.category_ids ?? [],
    base_description: c.base_description ?? '',
    meta_title: c.meta_title,
    meta_description: c.meta_description,
    image_url: c.image_url,
    common_specs: (c.common_specs ?? []).map(adaptSpecItem),
    variants: (c.variants ?? []).map(v => ({ slug: v.slug, specs: (v.specs ?? []).map(adaptSpecItem) })),
  };
}

// === Internal fetch helper ===
// Reads the `admin_token` http-only cookie and forwards it as a Bearer token.
// Always fetches fresh (revalidate: 0) since admin data must be current.
async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers, next: { revalidate: 0 } });
}

// GET helper: parse JSON or throw on non-ok
async function adminGet<T>(path: string): Promise<T> {
  const res = await adminFetch(path);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// === Admin API namespaces ===
export const adminApi = {
  manufacturers: {
    async all(page = 1, page_size = 20): Promise<{ items: Manufacturer[]; total: number }> {
      const data = await adminGet<ListResponse<BackendManufacturer>>(
        `/api/manufacturers?page=${page}&page_size=${page_size}`
      );
      return { items: data.items.map(adaptManufacturer), total: data.total };
    },
    async getById(id: string): Promise<Manufacturer | null> {
      try {
        const data = await adminGet<BackendManufacturer>(`/api/manufacturers/${id}`);
        return adaptManufacturer(data);
      } catch {
        return null;
      }
    },
    async getRawById(id: string): Promise<BackendManufacturer | null> {
      try {
        return await adminGet<BackendManufacturer>(`/api/manufacturers/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: { id: string; name: string; slug: string; country?: string | null; website?: string | null }): Promise<Manufacturer> {
      const res = await adminFetch('/api/manufacturers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers`);
      return adaptManufacturer(await res.json() as BackendManufacturer);
    },
    async update(id: string, payload: { id: string; name: string; slug: string; country?: string | null; website?: string | null }): Promise<Manufacturer> {
      const res = await adminFetch(`/api/manufacturers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
      return adaptManufacturer(await res.json() as BackendManufacturer);
    },
    async updateShowcase(id: string, payload: Partial<BackendManufacturer>): Promise<BackendManufacturer> {
      const res = await adminFetch(`/api/manufacturers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
      return await res.json() as BackendManufacturer;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/manufacturers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/manufacturers/${id}`);
    },
  },

  brands: {
    async all(page = 1, page_size = 20): Promise<{ items: Brand[]; total: number }> {
      const data = await adminGet<ListResponse<BackendBrand>>(
        `/api/brands?page=${page}&page_size=${page_size}`
      );
      return { items: data.items.map(adaptBrand), total: data.total };
    },
    async getById(id: string): Promise<Brand | null> {
      try {
        const data = await adminGet<BackendBrand>(`/api/brands/${id}`);
        return adaptBrand(data);
      } catch {
        return null;
      }
    },
    async create(payload: { id: string; name: string; slug: string; manufacturer_id: string }): Promise<Brand> {
      const res = await adminFetch('/api/brands', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/brands`);
      return adaptBrand(await res.json() as BackendBrand);
    },
    async update(id: string, payload: { id: string; name: string; slug: string; manufacturer_id: string }): Promise<Brand> {
      const res = await adminFetch(`/api/brands/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/brands/${id}`);
      return adaptBrand(await res.json() as BackendBrand);
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/brands/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/brands/${id}`);
    },
  },

  cables: {
    async all(page = 1, page_size = 20, q?: string): Promise<{ items: BackendCable[]; total: number }> {
      const params = new URLSearchParams({ page: String(page), page_size: String(page_size) });
      if (q) params.set('q', q);
      const data = await adminGet<ListResponse<BackendCable>>(`/api/cables?${params.toString()}`);
      return { items: data.items, total: data.total };
    },
    async getById(id: string): Promise<Cable | null> {
      try {
        const data = await adminGet<BackendCable>(`/api/cables/${id}`);
        return adaptCable(data);
      } catch {
        return null;
      }
    },
    // Returns the raw backend cable (with variants + specs in backend format)
    // so the edit page's JSON editors can round-trip the data on save.
    async getDetail(id: string): Promise<BackendCable | null> {
      try {
        return await adminGet<BackendCable>(`/api/cables/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendCable> {
      const res = await adminFetch('/api/cables', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/cables`);
      return await res.json() as BackendCable;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendCable> {
      const res = await adminFetch(`/api/cables/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/cables/${id}`);
      return await res.json() as BackendCable;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/cables/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/cables/${id}`);
    },
  },

  auth: {
    async me(): Promise<AdminUser | null> {
      try {
        return await adminGet<AdminUser>('/api/auth/me');
      } catch {
        return null;
      }
    },
  },

  taxonomy: {
    industries: {
      async all(): Promise<BackendIndustry[]> {
        return await adminGet<BackendIndustry[]>('/api/industries');
      },
      async getById(id: string): Promise<BackendIndustry | null> {
        try {
          return await adminGet<BackendIndustry>(`/api/industries/${encodeURIComponent(id)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { id: string; label: string; slug: string; description?: string | null; sort_order?: number }): Promise<BackendIndustry> {
        const res = await adminFetch('/api/industries', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries`);
        return await res.json() as BackendIndustry;
      },
      async update(id: string, payload: { label?: string; slug?: string; description?: string | null; sort_order?: number }): Promise<BackendIndustry> {
        const res = await adminFetch(`/api/industries/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${id}`);
        return await res.json() as BackendIndustry;
      },
      async remove(id: string): Promise<void> {
        const res = await adminFetch(`/api/industries/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${id}`);
      },
    },

    categories: {
      // industryId optional — if omitted, returns all categories across industries (requires aggregate endpoint)
      // For now we fetch the full taxonomy tree and flatten categories
      async all(industryId?: string): Promise<BackendCategory[]> {
        const tree = await adminGet<BackendIndustry[]>('/api/industries');
        const filtered = industryId ? tree.filter(i => i.id === industryId) : tree;
        return filtered.flatMap(i => i.categories ?? []);
      },
      async getById(id: string): Promise<BackendCategory | null> {
        // Category ID is composite: "industry_id/category_slug"
        // Backend route: GET /api/industries/{industry_id}/categories/{category_id}
        const segments = id.split('/');
        if (segments.length < 2) return null;
        const [industryId, catSlug] = segments;
        try {
          return await adminGet<BackendCategory>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { industry_id: string; id: string; label: string; slug: string; description?: string | null; sort_order?: number }): Promise<BackendCategory> {
        const { industry_id, ...body } = payload;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industry_id)}/categories`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industry_id}/categories`);
        return await res.json() as BackendCategory;
      },
      async update(id: string, payload: { label?: string; slug?: string; description?: string | null; sort_order?: number }): Promise<BackendCategory> {
        const segments = id.split('/');
        if (segments.length < 2) throw new Error(`Invalid category ID: ${id}`);
        const [industryId, catSlug] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industryId}/categories/${id}`);
        return await res.json() as BackendCategory;
      },
      async remove(id: string): Promise<void> {
        const segments = id.split('/');
        if (segments.length < 2) throw new Error(`Invalid category ID: ${id}`);
        const [industryId, catSlug] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: /api/industries/${industryId}/categories/${id}`);
      },
    },

    productTypes: {
      async all(categoryId?: string): Promise<BackendProductType[]> {
        if (categoryId) {
          const segments = categoryId.split('/');
          if (segments.length < 2) return [];
          const [industryId, catSlug] = segments;
          return await adminGet<BackendProductType[]>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}/product-types`);
        }
        // No filter — flatten from full taxonomy tree
        const tree = await adminGet<BackendIndustry[]>('/api/industries');
        return tree.flatMap(i => (i.categories ?? []).flatMap(c => c.product_types ?? []));
      },
      async getById(id: string): Promise<BackendProductType | null> {
        // Composite ID "industry/category/product_type" split into path segments
        const segments = id.split('/');
        if (segments.length < 3) return null;
        const [industryId, catSlug, ptSlug] = segments;
        try {
          return await adminGet<BackendProductType>(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}/product-types/${encodeURIComponent(ptSlug)}`);
        } catch {
          return null;
        }
      },
      async create(payload: { industry_id: string; category_id: string; id: string; label: string; slug: string; size_system: string; filters?: BackendTaxonomyFilter[]; sort_order?: number }): Promise<BackendProductType> {
        const { industry_id, category_id, ...body } = payload;
        // Split composite category_id "industry/category" into path segments
        const catSegments = category_id.split('/');
        if (catSegments.length < 2) throw new Error(`Invalid category_id: ${category_id}`);
        const [indSlug, catSlug] = catSegments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(indSlug)}/categories/${encodeURIComponent(catSlug)}/product-types`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`API ${res.status}: product-types create`);
        return await res.json() as BackendProductType;
      },
      async update(id: string, payload: { label?: string; slug?: string; size_system?: string; filters?: BackendTaxonomyFilter[]; sort_order?: number }): Promise<BackendProductType> {
        const segments = id.split('/');
        if (segments.length < 3) throw new Error(`Invalid product type ID: ${id}`);
        const [industryId, catSlug, ptSlug] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}/product-types/${encodeURIComponent(ptSlug)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`API ${res.status}: product-types update ${id}`);
        return await res.json() as BackendProductType;
      },
      async remove(id: string): Promise<void> {
        const segments = id.split('/');
        if (segments.length < 3) throw new Error(`Invalid product type ID: ${id}`);
        const [industryId, catSlug, ptSlug] = segments;
        const res = await adminFetch(`/api/industries/${encodeURIComponent(industryId)}/categories/${encodeURIComponent(catSlug)}/product-types/${encodeURIComponent(ptSlug)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`API ${res.status}: product-types delete ${id}`);
      },
    },
  },

  equipmentManufacturers: {
    async all(page = 1, page_size = 20): Promise<{ items: BackendEquipmentManufacturer[]; total: number }> {
      const data = await adminGet<ListResponse<BackendEquipmentManufacturer>>(
        `/api/equipment-manufacturers?page=${page}&page_size=${page_size}`
      );
      return { items: data.items, total: data.total };
    },
    async getById(id: string): Promise<BackendEquipmentManufacturer | null> {
      try {
        return await adminGet<BackendEquipmentManufacturer>(`/api/equipment-manufacturers/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipmentManufacturer> {
      const res = await adminFetch('/api/equipment-manufacturers', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers`);
      return await res.json() as BackendEquipmentManufacturer;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipmentManufacturer> {
      const res = await adminFetch(`/api/equipment-manufacturers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers/${id}`);
      return await res.json() as BackendEquipmentManufacturer;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/equipment-manufacturers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-manufacturers/${id}`);
    },
  },

  equipmentCategories: {
    async all(): Promise<BackendEquipmentCategory[]> {
      return await adminGet<BackendEquipmentCategory[]>('/api/equipment-categories');
    },
    async getById(id: string): Promise<BackendEquipmentCategory | null> {
      try {
        return await adminGet<BackendEquipmentCategory>(`/api/equipment-categories/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipmentCategory> {
      const res = await adminFetch('/api/equipment-categories', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories`);
      return await res.json() as BackendEquipmentCategory;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipmentCategory> {
      const res = await adminFetch(`/api/equipment-categories/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories/${id}`);
      return await res.json() as BackendEquipmentCategory;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/equipment-categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/equipment-categories/${id}`);
    },
  },

  equipment: {
    async all(page = 1, page_size = 20, filters?: { category_id?: string; manufacturer_id?: string }): Promise<{ items: BackendEquipment[]; total: number }> {
      const params = new URLSearchParams({ page: String(page), page_size: String(page_size) });
      if (filters?.category_id) params.set('category_id', filters.category_id);
      if (filters?.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const data = await adminGet<ListResponse<BackendEquipment>>(`/api/recommended-equipments?${params.toString()}`);
      return { items: data.items, total: data.total };
    },
    async getById(id: string): Promise<BackendEquipment | null> {
      try {
        return await adminGet<BackendEquipment>(`/api/recommended-equipments/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<BackendEquipment> {
      const res = await adminFetch('/api/recommended-equipments', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments`);
      return await res.json() as BackendEquipment;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<BackendEquipment> {
      const res = await adminFetch(`/api/recommended-equipments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments/${id}`);
      return await res.json() as BackendEquipment;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/recommended-equipments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/recommended-equipments/${id}`);
    },
  },

  adminMenu: {
    async tree(): Promise<MenuItemTree[]> {
      return await adminGet<MenuItemTree[]>('/api/admin/menu/tree');
    },
    async all(): Promise<MenuItem[]> {
      return await adminGet<MenuItem[]>('/api/admin/menu');
    },
    async getById(id: string): Promise<MenuItem | null> {
      try {
        return await adminGet<MenuItem>(`/api/admin/menu/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    async create(payload: Record<string, unknown>): Promise<MenuItem> {
      const res = await adminFetch('/api/admin/menu', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu`);
      return await res.json() as MenuItem;
    },
    async update(id: string, payload: Record<string, unknown>): Promise<MenuItem> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}`);
      return await res.json() as MenuItem;
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}`);
    },
    async sort(id: string, direction: 'up' | 'down'): Promise<MenuItem> {
      const res = await adminFetch(`/api/admin/menu/${encodeURIComponent(id)}/sort`, {
        method: 'PUT',
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error(`API ${res.status}: /api/admin/menu/${id}/sort`);
      return await res.json() as MenuItem;
    },
  },

  roles: {
    async all(): Promise<Role[]> {
      return adminGet<Role[]>("/api/admin/roles");
    },
    async getById(id: string): Promise<Role | null> {
      try {
        return await adminGet<Role>(`/api/admin/roles/${id}`);
      } catch {
        return null;
      }
    },
    async modules(): Promise<AdminModule[]> {
      return adminGet<AdminModule[]>("/api/admin/roles/modules");
    },
    async create(payload: {
      id: string;
      name: string;
      description?: string;
      scope_type?: string | null;
      sort_order?: number;
      permissions: string[];
    }): Promise<Role> {
      const res = await adminFetch("/api/admin/roles", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async update(id: string, payload: {
      name?: string;
      description?: string;
      scope_type?: string | null;
      sort_order?: number;
      permissions?: string[];
    }): Promise<Role> {
      const res = await adminFetch(`/api/admin/roles/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/roles/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },

  users: {
    async all(): Promise<AdminUserExtended[]> {
      return adminGet<AdminUserExtended[]>("/api/admin/users");
    },
    async getById(id: number): Promise<AdminUserExtended | null> {
      try {
        return await adminGet<AdminUserExtended>(`/api/admin/users/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: {
      email: string;
      password: string;
      role_id: string;
      scope_id?: string | null;
      is_active?: boolean;
    }): Promise<AdminUserExtended> {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async update(id: number, payload: {
      email?: string;
      password?: string;
      role_id?: string;
      scope_id?: string | null;
      is_active?: boolean;
    }): Promise<AdminUserExtended> {
      const res = await adminFetch(`/api/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: number): Promise<void> {
      const res = await adminFetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
    async scopes(scopeType: string): Promise<ScopeOption[]> {
      return adminGet<ScopeOption[]>(`/api/admin/users/scopes/${scopeType}`);
    },
  },

  me: {
    async permissions(): Promise<UserPermissions> {
      return adminGet<UserPermissions>("/api/auth/me/permissions");
    },
  },

  members: {
    async all(filters?: { q?: string; is_verified?: boolean; is_active?: boolean }): Promise<AdminMember[]> {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.is_verified !== undefined) params.set('is_verified', String(filters.is_verified));
      if (filters?.is_active !== undefined) params.set('is_active', String(filters.is_active));
      const query = params.toString();
      return adminGet<AdminMember[]>(`/api/admin/members${query ? `?${query}` : ''}`);
    },
    async getById(id: number): Promise<AdminMember | null> {
      try {
        return await adminGet<AdminMember>(`/api/admin/members/${id}`);
      } catch {
        return null;
      }
    },
    async update(id: number, payload: { name: string; company?: string | null; phone?: string | null }): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async activate(id: number, is_active: boolean): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}/activate`, {
        method: 'PUT',
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async verify(id: number): Promise<AdminMember> {
      const res = await adminFetch(`/api/admin/members/${id}/verify`, {
        method: 'PUT',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
      return res.json();
    },
    async remove(id: number): Promise<void> {
      const res = await adminFetch(`/api/admin/members/${id}/delete`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },

  pages: {
    async all(page = 1, pageSize = 20, statusFilter?: string): Promise<{ items: PageListItem[]; total: number; page: number; page_size: number }> {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      if (statusFilter) params.set('status', statusFilter);
      return adminGet<{ items: PageListItem[]; total: number; page: number; page_size: number }>(
        `/api/admin/pages?${params}`
      );
    },
    async getById(id: string): Promise<Page | null> {
      try {
        return await adminGet<Page>(`/api/admin/pages/${id}`);
      } catch {
        return null;
      }
    },
    async create(payload: { id: string; slug: string; title: string; content?: string; status?: string; is_visible?: boolean; sort_order?: number; meta_title?: string | null; meta_description?: string | null; og_image_url?: string | null }): Promise<Page> {
      const res = await adminFetch('/api/admin/pages', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}: /api/admin/pages`);
      }
      return res.json();
    },
    async update(id: string, payload: Partial<Page>): Promise<Page> {
      const res = await adminFetch(`/api/admin/pages/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}: /api/admin/pages/${id}`);
      }
      return res.json();
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/pages/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },

  siteMenu: {
    async all(locationFilter?: 'header' | 'footer'): Promise<SiteMenuItem[]> {
      const params = locationFilter ? `?location=${locationFilter}` : '';
      return adminGet<SiteMenuItem[]>(`/api/admin/site-menu${params}`);
    },
    async getById(id: string): Promise<SiteMenuItem | null> {
      try {
        return await adminGet<SiteMenuItem>(`/api/admin/site-menu/${id}`);
      } catch {
        return null;
      }
    },
    async getTree(location: 'header' | 'footer'): Promise<SiteMenuItem[]> {
      return adminGet<SiteMenuItem[]>(`/api/admin/site-menu/tree?location=${location}`);
    },
    async create(payload: {
      id: string;
      location: 'header' | 'footer';
      parent_id?: string | null;
      type: 'link' | 'group';
      label: string;
      url?: string | null;
      sort_order?: number;
      is_visible?: boolean;
    }): Promise<SiteMenuItem> {
      const res = await adminFetch('/api/admin/site-menu', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}: /api/admin/site-menu`);
      }
      return res.json();
    },
    async update(id: string, payload: Partial<SiteMenuItem>): Promise<SiteMenuItem> {
      const res = await adminFetch(`/api/admin/site-menu/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}: /api/admin/site-menu/${id}`);
      }
      return res.json();
    },
    async remove(id: string): Promise<void> {
      const res = await adminFetch(`/api/admin/site-menu/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
    async sort(id: string, direction: 'up' | 'down'): Promise<void> {
      const res = await adminFetch(`/api/admin/site-menu/${id}/sort`, {
        method: 'PUT',
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }
    },
  },
};
