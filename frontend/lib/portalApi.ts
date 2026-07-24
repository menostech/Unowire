import { cookies } from 'next/headers';

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
    async me() {
      try {
        return await portalGet<{
          id: number;
          email: string;
          role_id: string;
          role_name: string;
          scope_type: string;
          scope_id: string;
        }>('/api/portal/auth/me');
      } catch {
        return null;
      }
    },
    async permissions() {
      try {
        return await portalGet<{
          user_id: number;
          email: string;
          role_id: string;
          role_name: string;
          scope_type: string;
          scope_id: string;
          allowed_modules: string[];
        }>('/api/portal/auth/me/permissions');
      } catch {
        return null;
      }
    },
  },
  dashboard: {
    async get() {
      return portalGet<{
        factory_name: string;
        scope_type: string;
        stats: {
          cables_count?: number;
          equipment_count?: number;
          views_total: number;
          views_trend_30d: number;
          inquiries_total: number;
          inquiries_unread: number;
        };
        inquiry_trend: { date: string; count: number }[];
        views_trend: { date: string; count: number }[];
        recent_inquiries: {
          id: number;
          subject: string;
          created_at: string;
          is_read: boolean;
        }[];
      }>('/api/portal/dashboard');
    },
  },
  cables: {
    async all() {
      return portalGet<any[]>('/api/portal/cables');
    },
    async getById(id: string) {
      return portalGet<any>(`/api/portal/cables/${id}`);
    },
  },
  equipment: {
    async all() {
      return portalGet<any[]>('/api/portal/equipment');
    },
    async getById(id: string) {
      return portalGet<any>(`/api/portal/equipment/${id}`);
    },
  },
  inquiries: {
    async all() {
      return portalGet<any[]>('/api/portal/inquiries');
    },
    async unreadCount() {
      return portalGet<{ count: number }>('/api/portal/inquiries/unread-count');
    },
    async getById(id: number) {
      return portalGet<any>(`/api/portal/inquiries/${id}`);
    },
  },
  folders: {
    async all() {
      return portalGet<any[]>('/api/portal/folders');
    },
  },
  uploads: {
    async all() {
      return portalGet<{ items: any[]; total: number }>('/api/portal/uploads');
    },
  },
  me: {
    async get() {
      return portalGet<{
        id: number;
        email: string;
        role_id: string;
        role_name: string;
        scope_type: string;
        scope_id: string;
      }>('/api/portal/me');
    },
  },
};
