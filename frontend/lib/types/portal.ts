export type PortalScopeType = 'manufacturer' | 'equipment_manufacturer';

export interface PortalUser {
  id: number;
  email: string;
  role_id: string;
  role_name: string | null;
  scope_type: PortalScopeType | null;
  scope_id: string | null;
}

// NOTE: backend /api/portal/auth/me/permissions returns `user_id` (not `id`),
// so this is its own interface — it does NOT extend PortalUser.
export interface PortalPermissions {
  user_id: number;
  email: string;
  role_id: string;
  role_name: string | null;
  scope_type: PortalScopeType | null;
  scope_id: string | null;
  allowed_modules: string[];
}

export interface PortalDashboardStats {
  cables_count?: number;
  equipment_count?: number;
  views_total: number;
  views_trend_30d: number;
  inquiries_total: number;
  inquiries_unread: number;
}

export interface PortalDashboard {
  factory_name: string;
  scope_type: string;
  stats: PortalDashboardStats;
  inquiry_trend: { date: string; count: number }[];
  views_trend: { date: string; count: number }[];
  recent_inquiries: {
    id: number;
    subject: string;
    created_at: string | null;
    is_read: boolean;
  }[];
}

// Matches backend CableRead (backend/app/schemas/cable.py).
// id / manufacturer_id are `string` (BigInteger stored as str in the schema).
export interface PortalCable {
  id: string;
  model: string;
  slug: string;
  base_description: string | null;
  manufacturer_id: string;
  product_type_id: string;
  industry_id: string;
  category_id: string;
  size_system: string;
  meta_title: string | null;
  meta_description: string | null;
  image_url: string | null;
  manufacturer: { id: string; name: string } | null;
  common_specs: unknown[];
  variants: unknown[];
  created_at: string;
  updated_at: string;
}

// Portal-specific cable create payload (omits id, manufacturer_id, common_specs, variants).
export interface PortalCableCreate {
  product_type_id: string;
  industry_id: string;
  category_id: string;
  model: string;
  slug: string;
  size_system: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string;
  meta_title?: string;
  meta_description?: string;
  image_url?: string;
  category_ids?: string[];
}

// Cable update payload — widened to cover all editable fields.
export interface PortalCableUpdate {
  model?: string;
  slug?: string;
  size_system?: 'awg' | 'mm2' | 'kcmil' | 'none';
  base_description?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  image_url?: string | null;
  industry_id?: string;
  category_id?: string;
  product_type_id?: string;
}

// Matches backend RecommendedEquipmentRead (backend/app/schemas/equipment.py).
export interface PortalEquipment {
  id: string;
  manufacturer_id: string;
  category_id: string;
  model: string;
  slug: string;
  applicable_specs: unknown[];
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  sort_order: number;
  manufacturer: { id: string; name: string; slug: string } | null;
  category: { id: string; label: string; slug: string } | null;
  created_at: string;
  updated_at: string;
}

// Portal-specific equipment create payload (omits id, manufacturer_id, applicable_specs).
export interface PortalEquipmentCreate {
  category_id: string;
  model: string;
  slug: string;
  description?: string;
  image_url?: string;
  external_url?: string;
  sort_order?: number;
}

// Equipment update payload — widened to cover all editable fields.
export interface PortalEquipmentUpdate {
  model?: string;
  slug?: string;
  description?: string | null;
  image_url?: string | null;
  external_url?: string | null;
  sort_order?: number;
  category_id?: string;
}

// Matches backend InquiryRead (backend/app/schemas/inquiry.py).
export interface PortalInquiry {
  id: number;
  sender_id: number;
  recipient_type: string;
  recipient_id: string;
  recipient_name: string | null;
  subject: string;
  body: string;
  reply_body: string | null;
  replied_at: string | null;
  replied_by: number | null;
  is_read: boolean;
  is_member_read: boolean;
  created_at: string;
}

// Matches the dict returned by GET /api/portal/folders (portal_media.py list_folders).
export interface PortalFolder {
  id: number;
  name: string;
  parent_id: number | null;
  scope_type: string;
  scope_id: string;
  upload_count: number;
}

export interface PortalFolderCreate {
  name: string;
  parent_id: number | null;
}

// Matches the item dict returned by GET /api/portal/uploads (portal_media.py list_uploads).
export interface PortalUpload {
  id: number;
  filename: string;
  url_path: string;
  folder_id: number | null;
  created_at: string | null;
}

export interface PortalUploadPage {
  items: PortalUpload[];
  total: number;
  page: number;
  page_size: number;
}

// Matches backend ProductTypeRead (backend/app/schemas/taxonomy.py).
export interface TaxonomyProductType {
  id: string;
  label: string;
  slug: string;
  size_system: string;
  sort_order: number;
  image_url: string | null;
}

// Matches backend CategoryRead.
export interface TaxonomyCategory {
  id: string;
  industry_id: string;
  label: string;
  slug: string;
  description: string | null;
  product_types: TaxonomyProductType[];
  sort_order: number;
  image_url: string | null;
}

// Matches backend IndustryRead.
export interface TaxonomyIndustry {
  id: string;
  label: string;
  slug: string;
  description: string | null;
  categories: TaxonomyCategory[];
  sort_order: number;
  image_url: string | null;
}

// Matches backend EquipmentCategoryTreeRead (backend/app/schemas/equipment.py).
export interface EquipmentCategoryChild {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
}

export interface EquipmentCategoryTree {
  id: string;
  parent_id: string | null;
  label: string;
  slug: string;
  description: string | null;
  sort_order: number;
  image_url: string | null;
  children: EquipmentCategoryChild[];
}

// Matches backend PortalMessageRead (backend/app/schemas/system_message.py).
export interface PortalMessage {
  id: number;
  title: string;
  body: string;
  created_at: string;
  is_read: boolean;
}

export interface PortalMessageListResponse {
  items: PortalMessage[];
  total: number;
  page: number;
  page_size: number;
}
