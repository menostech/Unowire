// === Data Models ===
export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  country: string;
  website: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  manufacturer_id: string;
  country: string;
  website: string;
}

export interface Category {
  id: string;
  level: 1 | 2 | 3 | 4;
  name: string;
  slug: string;
  parent_id: string | null;
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

export interface CableVariant {
  slug: string;
  specs: SpecItem[];
}

export interface Cable {
  id: string;
  brand_id: string;
  model: string;
  slug: string;
  type: string;
  category_ids: string[];
  base_description: string;
  meta_title: string | null;
  meta_description: string | null;
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

export interface RecommendedEquipment {
  id: string;
  brand: string;
  model: string;
  type: string;
  description: string;
  applicable_specs: ApplicableSpecRule[];
  external_url: string;
}

export interface RecommendedEquipmentResult {
  equipment: RecommendedEquipment;
  matched_variants: CableVariant[];
  explanation: { spec_key: string; label: string; matched_value: string | number }[];
}

// === Filter / Query Params ===
export interface CableQueryParams {
  q?: string;
  manufacturer?: string[];
  brand?: string[];
  category?: string[];
  awg?: string[];
  min_area?: number;
  max_area?: number;
  min_od?: number;
  max_od?: number;
  shielding?: string[];
  jacket?: string[];
  core_structure?: string[];
  page: number;
  page_size: number;
}

// === Filter Facets ===
export interface FilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  categories: { id: string; name: string; level: number; count: number }[];
  awg: { value: string; count: number }[];
  conductor_area: { min: number; max: number };
  outer_diameter: { min: number; max: number };
  shielding: { value: string; count: number }[];
  jacket: { value: string; count: number }[];
  core_structure: { value: string; count: number }[];
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
