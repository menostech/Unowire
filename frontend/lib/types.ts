// === Data Models ===
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
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

export interface Brand {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  country: string;
  website: string;
  image_url: string | null;
}

export interface Category {
  id: string;
  level: 1 | 2 | 3 | 4;
  name: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
}

export type SpecType = "string" | "number" | "enum";

export interface SpecItem {
  key: string;
  label: string;
  value: string | number;
  unit: string | null;
  type: SpecType;
  filterable: boolean;
}

// === Industry & Size System ===
export type Industry =
  | "consumer_electronics"
  | "automotive_ev"
  | "data_centers"
  | "renewables"
  | "telecom_power"
  | "utility";

export type SizeSystem = "awg" | "mm2" | "kcmil" | "none";

// === Taxonomy (data/taxonomy.json) ===
export type FilterControl = "enum" | "range" | "enum_range";

export interface TaxonomyFilter {
  spec_key: string;
  label: string;
  control: FilterControl;
  unit?: string;
}

export interface ProductTypeConfig {
  label: string;
  slug: string;
  size_system: SizeSystem;
  filters: TaxonomyFilter[];
  image_url: string | null;
}

export interface TaxonomyCategory {
  label: string;
  slug: string;
  product_types: Record<string, ProductTypeConfig>;
}

export interface TaxonomyIndustry {
  label: string;
  slug: string;
  description: string;
  categories: Record<string, TaxonomyCategory>;
  image_url: string | null;
}

export type Taxonomy = Record<string, TaxonomyIndustry>;

export interface CableVariant {
  slug: string;
  specs: SpecItem[];
}

export interface Cable {
  id: string;
  brand_id: string;
  model: string;
  slug: string;
  type: string;              // legacy, retained for migration; same value as product_type
  industry: Industry;
  category: string;          // NEW: category key in taxonomy.json
  product_type: string;      // NEW: product type key in taxonomy.json
  size_system: SizeSystem;
  category_ids: string[];
  base_description: string;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  common_specs: SpecItem[];
  variants: CableVariant[];
}

// === Recommended Equipment ===
export interface ApplicableSpecRule {
  spec_key: string;
  min?: number;
  max?: number;
  allowed_values?: (string | number)[];
}

export interface EquipmentManufacturer {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  website: string | null;
  image_url: string | null;
  description: string | null;
}

export interface EquipmentCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  // `children` is present on the tree endpoint (list), absent on flat reads
  // (e.g. nested category inside RecommendedEquipment). Always use `?? []`.
  children?: EquipmentCategory[];
}

export interface RecommendedEquipment {
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
  manufacturer: EquipmentManufacturer | null;
  category: EquipmentCategory | null;
}

export interface RecommendedEquipmentResult {
  equipment: RecommendedEquipment;
  matched_variants: CableVariant[];
  explanation: { spec_key: string; label: string; matched_value: string | number }[];
}

// === Filter / Query Params ===
// NOTE: industry/category/product_type are REQUIRED route params (not query string).
// They are part of this interface so filterCables receives a single params object.
export interface CableQueryParams {
  // Route identity (required)
  industry: string;
  category: string;
  product_type: string;

  // Filter params (query string)
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  size?: string[];              // enum values (for awg) or discrete selections (for mm2/kcmil)
  min_size?: number;            // range lower bound (mm2/kcmil only)
  max_size?: number;            // range upper bound (mm2/kcmil only)
  spec_filters?: Record<string, string[]>;
  min_od?: number;
  max_od?: number;

  // Pagination
  page: number;
  page_size: number;
}

// === Cross-industry text search params (for /cables overview) ===
export interface TextSearchParams {
  q: string;
  page: number;
  page_size: number;
}

// === Filter Facets ===
export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  size: { value: string; count: number }[];                  // no size_system grouping (route fixes it)
  size_range: { min: number; max: number } | null;           // null when size_system=none or no cables
  spec_facets: Record<string, { value: string; count: number }[]>;
  outer_diameter: { min: number; max: number } | null;       // null when no cables in scope
}

// === List Response ===
export interface CableListItem {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
}

export interface CableListResponse {
  items: CableListItem[];
  total: number;
  page: number;
  page_size: number;
  filters: FilterFacets;
}

// === API Detail Response ===
export interface CableDetailResponse {
  cable: Cable;
  brand: Brand | null;
  manufacturer: Manufacturer | null;
  categories: Category[];
  recommended_equipments: RecommendedEquipmentResult[];
}

// === Validation ===
export interface ValidationError {
  file: string;
  cable_id?: string;
  message: string;
  severity: "error" | "warning";
}

// === Admin Menu ===
export type MenuItemType = "page" | "link" | "group";

export interface MenuItem {
  id: string;
  parent_id: string | null;
  type: MenuItemType;
  page_id: string | null;
  url: string | null;
  label: string;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItemTree extends MenuItem {
  children: MenuItem[];
}

// === RBAC ===
export interface Role {
  id: string;
  name: string;
  description: string | null;
  scope_type: string | null;
  is_system: boolean;
  sort_order: number;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface AdminUserExtended {
  id: number;
  email: string;
  role_id: string;
  scope_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role_name: string | null;
  role_scope_type: string | null;
}

export interface UserPermissions {
  user_id: number;
  email: string;
  role_id: string;
  role_name: string;
  scope_type: string | null;
  scope_id: string | null;
  allowed_modules: string[];
}

export interface ScopeOption {
  id: string;
  name: string;
}
