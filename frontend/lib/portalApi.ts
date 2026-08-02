import { cookies } from 'next/headers';
import type {
  PortalUser,
  PortalPermissions,
  PortalDashboard,
  PortalCable,
  PortalEquipment,
  PortalTerminal,
  PortalInquiry,
  PortalFolder,
  PortalUpload,
  PortalUploadPage,
  PortalMessage,
  PortalMessageListResponse,
  EquipmentCategoryTree,
  TerminalCategoryTree,
} from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

/**
 * Server-side fetch helper for portal API.
 * Reads the `portal_token` http-only cookie and forwards it as a Bearer token.
 * Always fetches fresh (revalidate: 0) since portal data must be current.
 */
async function portalFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('portal_token')?.value;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers, next: { revalidate: 0 } });
}

async function portalGet<T>(path: string): Promise<T> {
  const res = await portalFetch(path);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const portalApi = {
  auth: {
    async me(): Promise<PortalUser | null> {
      try {
        return await portalGet<PortalUser>('/api/portal/auth/me');
      } catch {
        return null;
      }
    },
    async permissions(): Promise<PortalPermissions | null> {
      try {
        return await portalGet<PortalPermissions>('/api/portal/auth/me/permissions');
      } catch {
        return null;
      }
    },
  },
  dashboard: {
    async get(): Promise<PortalDashboard> {
      return portalGet<PortalDashboard>('/api/portal/dashboard');
    },
  },
  cables: {
    async all(params?: {
      search?: string;
      industry_id?: string;
      category_id?: string;
      product_type_id?: string;
    }): Promise<PortalCable[]> {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.industry_id) qs.set('industry_id', params.industry_id);
      if (params?.category_id) qs.set('category_id', params.category_id);
      if (params?.product_type_id) qs.set('product_type_id', params.product_type_id);
      const suffix = qs.toString() ? `?${qs}` : '';
      return portalGet<PortalCable[]>(`/api/portal/cables${suffix}`);
    },
    async getById(id: string): Promise<PortalCable> {
      return portalGet<PortalCable>(`/api/portal/cables/${id}`);
    },
  },
  equipment: {
    async all(params?: { search?: string; category_id?: string; page?: number; page_size?: number }): Promise<{ items: PortalEquipment[]; total: number; page: number; page_size: number }> {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category_id) qs.set('category_id', params.category_id);
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.page_size != null) qs.set('page_size', String(params.page_size));
      const suffix = qs.toString() ? `?${qs}` : '';
      return portalGet<{ items: PortalEquipment[]; total: number; page: number; page_size: number }>(`/api/portal/equipment${suffix}`);
    },
    async getById(id: string): Promise<PortalEquipment> {
      return portalGet<PortalEquipment>(`/api/portal/equipment/${id}`);
    },
  },
  equipmentCategories: {
    async all(): Promise<EquipmentCategoryTree[]> {
      return portalGet<EquipmentCategoryTree[]>('/api/equipment-categories');
    },
  },
  terminals: {
    async all(params?: { search?: string; category_id?: string; page?: number; page_size?: number }): Promise<{ items: PortalTerminal[]; total: number; page: number; page_size: number }> {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.category_id) qs.set('category_id', params.category_id);
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.page_size != null) qs.set('page_size', String(params.page_size));
      const suffix = qs.toString() ? `?${qs}` : '';
      return portalGet<{ items: PortalTerminal[]; total: number; page: number; page_size: number }>(`/api/portal/terminals${suffix}`);
    },
    async getById(id: string): Promise<PortalTerminal> {
      return portalGet<PortalTerminal>(`/api/portal/terminals/${id}`);
    },
  },
  terminalCategories: {
    async all(): Promise<TerminalCategoryTree[]> {
      return portalGet<TerminalCategoryTree[]>('/api/terminal-categories');
    },
  },
  inquiries: {
    async all(): Promise<PortalInquiry[]> {
      return portalGet<PortalInquiry[]>('/api/portal/inquiries');
    },
    async unreadCount(): Promise<{ count: number }> {
      return portalGet<{ count: number }>('/api/portal/inquiries/unread-count');
    },
    async getById(id: number): Promise<PortalInquiry> {
      return portalGet<PortalInquiry>(`/api/portal/inquiries/${id}`);
    },
  },
  folders: {
    async all(): Promise<PortalFolder[]> {
      return portalGet<PortalFolder[]>('/api/portal/folders');
    },
  },
  uploads: {
    async all(params?: { folderId?: number; page?: number; pageSize?: number }): Promise<PortalUploadPage> {
      const qs = new URLSearchParams();
      if (params?.folderId != null) qs.set('folder_id', String(params.folderId));
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.pageSize != null) qs.set('page_size', String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : '';
      return portalGet<PortalUploadPage>(`/api/portal/uploads${suffix}`);
    },
  },
  messages: {
    async all(page = 1, pageSize = 20): Promise<PortalMessageListResponse> {
      return portalGet<PortalMessageListResponse>(
        `/api/portal/messages?page=${page}&page_size=${pageSize}`,
      );
    },
    async getById(id: number): Promise<PortalMessage> {
      return portalGet<PortalMessage>(`/api/portal/messages/${id}`);
    },
    async unreadCount(): Promise<{ unread: number }> {
      return portalGet<{ unread: number }>('/api/portal/messages/unread-count');
    },
  },
};
