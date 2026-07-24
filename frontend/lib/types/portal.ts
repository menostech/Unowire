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

// Narrow subset of backend CableUpdate that the edit form submits.
export interface PortalCableUpdate {
  model?: string;
  base_description?: string | null;
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

// Narrow subset of backend RecommendedEquipmentUpdate that the edit form submits.
export interface PortalEquipmentUpdate {
  model?: string;
  description?: string | null;
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

// Matches the item dict returned by GET /api/portal/uploads (portal_media.py list_uploads).
export interface PortalUpload {
  id: number;
  filename: string;
  url_path: string;
  folder_id: number | null;
  created_at: string | null;
}

export interface PortalUploadsResponse {
  items: PortalUpload[];
  total: number;
  page: number;
  page_size: number;
}
