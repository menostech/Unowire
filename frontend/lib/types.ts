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
  manufacturer_id: string;
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
  founded_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

// === Terminals ===
export interface TerminalManufacturer {
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

export interface TerminalCategory {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  // `children` is present on the tree endpoint (list), absent on flat reads
  // (e.g. nested category inside Terminal). Always use `?? []`.
  children?: TerminalCategory[];
}

export interface Terminal {
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
  manufacturer: TerminalManufacturer | null;
  category: TerminalCategory | null;
}

export interface TerminalFilterParams {
  q?: string;
  category_ids?: string[];
  manufacturer_ids?: string[];
  spec_filters?: Record<string, { min?: number; max?: number; values?: string[] }>;
}

export interface TerminalFilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  categories: { id: string; label: string; parent_id: string | null; count: number }[];
  spec_facets: Record<string, {
    type: "range" | "enum";
    min?: number; max?: number;
    values?: { value: string; count: number }[];
  }>;
}

export interface TerminalListResponse {
  items: Terminal[];
  total: number;
  page: number;
  page_size: number;
  facets: TerminalFilterFacets;
}


// === Terminal → Connectivity aliases (deprecated old names still importable) ===
export type Connectivity = Terminal;
export type ConnectivityManufacturer = TerminalManufacturer;
export type ConnectivityCategory = TerminalCategory;
export type ConnectivityFilterParams = TerminalFilterParams;
export type ConnectivityFilterFacets = TerminalFilterFacets;
export type ConnectivityListResponse = TerminalListResponse;
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
  size: { value: string; count: number }[];                  // no size_system grouping (route fixes it)
  size_range: { min: number; max: number } | null;           // null when size_system=none or no cables
  spec_facets: Record<string, { value: string; count: number }[]>;
  outer_diameter: { min: number; max: number } | null;       // null when no cables in scope
}

// === List Response ===
export interface CableListItem {
  cable: Cable;
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

export interface AdminMember {
  id: number;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  inquiry_count: number;
}

// === CMS Pages ===
export interface Page {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: "draft" | "published";
  is_visible: boolean;
  sort_order: number;
  published_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageListItem {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  is_visible: boolean;
  sort_order: number;
  published_at: string | null;
  updated_at: string;
}

export interface PagePublicRead {
  slug: string;
  title: string;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
}

// === Site Menu ===
export type SiteMenuLocation = "header" | "footer";
export type SiteMenuItemType = "link" | "group";

export interface SiteMenuItem {
  id: string;
  location: SiteMenuLocation;
  parent_id: string | null;
  type: SiteMenuItemType;
  label: string;
  url: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiteMenuTreeNode {
  id: string;
  type: SiteMenuItemType;
  label: string;
  url: string | null;
  children: SiteMenuTreeNode[];
}

// === Equipment Filters ===
export interface EquipmentFilterParams {
  q?: string;
  category_ids?: string[];
  manufacturer_ids?: string[];
  spec_filters?: Record<string, { min?: number; max?: number; values?: string[] }>;
}

export interface EquipmentFilterFacets {
  manufacturers: { id: string; name: string; count: number }[];
  categories: { id: string; label: string; parent_id: string | null; count: number }[];
  spec_facets: Record<string, {
    type: "range" | "enum";
    min?: number; max?: number;
    values?: { value: string; count: number }[];
  }>;
}

export interface EquipmentListResponse {
  items: RecommendedEquipment[];
  total: number;
  page: number;
  page_size: number;
  facets: EquipmentFilterFacets;
}

// === System Messages ===
// Targeted messaging — value is stored as string in JSONB for type consistency
// with PostgreSQL `@>` containment queries.
export type RecipientTargetKind = 'group' | 'user' | 'member';
export type RecipientGroupValue = 'cable_managers' | 'equipment_managers' | 'members';

export interface RecipientTarget {
  kind: RecipientTargetKind;
  value: string;
}

export interface RecipientListItem {
  id: number;
  email: string;
  name: string | null;
}

export interface RecipientListResponse {
  cable_managers: RecipientListItem[];
  equipment_managers: RecipientListItem[];
  members: RecipientListItem[];
}

export interface AdminMessage {
  id: number;
  title: string;
  body: string;
  created_by: number;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  recipient_type: 'broadcast' | 'targeted';
  recipient_targets: RecipientTarget[] | null;
}

export interface AdminMessageListResponse {
  items: AdminMessage[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemberMessage {
  id: number;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

export interface MemberMessageListResponse {
  items: MemberMessage[];
  total: number;
  page: number;
  page_size: number;
}

export interface UnreadCount {
  unread: number;
}

// === Inquiries ===
export interface InquiryRead {
  id: number;
  sender_id: number;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;  // resolved at query time; null if manufacturer deleted
  subject: string;
  body: string;
  reply_body: string | null;
  replied_at: string | null;
  replied_by: number | null;
  is_read: boolean;
  is_member_read: boolean;
  created_at: string;
}

// === Membership / Plans ===
export interface Plan {
  id: number;
  name: string;
  tier_level: 'freemium' | 'personal' | 'enterprise' | string;
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

export interface SubscriptionStatus {
  id: number;
  plan_id: number;
  plan_name: string;
  tier_level: string;
  status: 'active' | 'trialing' | 'expired' | 'cancelled' | 'paid' | 'past_due' | string;
  billing_cycle: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  search_limit_daily: number | null;
  detail_view_limit_daily: number | null;
  download_limit_monthly: number | null;
  gateway?: string | null;
  gateway_subscription_id?: string | null;
  grace_period_end?: string | null;
}

export interface UsageSummary {
  plan: string;
  today: { search: { used: number; limit: number | null }; detail_view: { used: number; limit: number | null } };
  this_month: { download: { used: number; limit: number | null } };
}
