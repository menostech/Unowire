import type {
  PortalCable,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentUpdate,
  PortalInquiry,
} from '@/lib/types/portal';

export class PortalApiError extends Error {
  constructor(
    public status: number,
    public code: number,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'PortalApiError';
  }
}

async function bffFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new PortalApiError(
      res.status,
      data.code ?? res.status,
      data.message ?? 'Request failed',
      data.field_errors,
    );
  }
  return res;
}

export const portalApiClient = {
  cables: {
    async update(id: string, data: PortalCableUpdate): Promise<PortalCable> {
      const res = await bffFetch(`/api/portal/cables/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  equipment: {
    async update(id: string, data: PortalEquipmentUpdate): Promise<PortalEquipment> {
      const res = await bffFetch(`/api/portal/equipment/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  inquiries: {
    async reply(id: number, replyBody: string): Promise<PortalInquiry> {
      const res = await bffFetch(`/api/portal/inquiries/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply_body: replyBody }),
      });
      return res.json();
    },
  },
  auth: {
    async changePassword(oldPassword: string, newPassword: string): Promise<void> {
      await bffFetch('/api/portal/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
    },
  },
};
