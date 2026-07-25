import type {
  PortalCable,
  PortalCableCreate,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentCreate,
  PortalEquipmentUpdate,
  PortalFolder,
  PortalFolderCreate,
  PortalInquiry,
  PortalUpload,
  PortalUploadPage,
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

async function bffFetch(
  path: string,
  options: RequestInit & { skipDefaultContentType?: boolean } = {},
): Promise<Response> {
  const { skipDefaultContentType, headers, ...rest } = options;
  const finalHeaders = skipDefaultContentType
    ? (headers as Record<string, string> | undefined)
    : { 'Content-Type': 'application/json', ...((headers as Record<string, string>) ?? {}) };
  const res = await fetch(path, { ...rest, headers: finalHeaders });
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
    async create(data: PortalCableCreate): Promise<PortalCable> {
      const res = await bffFetch('/api/portal/cables', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async update(id: string, data: PortalCableUpdate): Promise<PortalCable> {
      const res = await bffFetch(`/api/portal/cables/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/cables/${id}`, { method: 'DELETE' });
    },
  },
  equipment: {
    async create(data: PortalEquipmentCreate): Promise<PortalEquipment> {
      const res = await bffFetch('/api/portal/equipment', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async update(id: string, data: PortalEquipmentUpdate): Promise<PortalEquipment> {
      const res = await bffFetch(`/api/portal/equipment/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/equipment/${id}`, { method: 'DELETE' });
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
  folders: {
    async all(): Promise<PortalFolder[]> {
      const res = await bffFetch('/api/portal/folders');
      return res.json();
    },
    async create(data: PortalFolderCreate): Promise<PortalFolder> {
      const res = await bffFetch('/api/portal/folders', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  uploads: {
    async all(params?: { folderId?: number; page?: number; pageSize?: number }): Promise<PortalUploadPage> {
      const qs = new URLSearchParams();
      if (params?.folderId != null) qs.set('folder_id', String(params.folderId));
      if (params?.page != null) qs.set('page', String(params.page));
      if (params?.pageSize != null) qs.set('page_size', String(params.pageSize));
      const suffix = qs.toString() ? `?${qs}` : '';
      const res = await bffFetch(`/api/portal/uploads${suffix}`);
      return res.json();
    },
    async create(formData: FormData): Promise<PortalUpload> {
      const res = await bffFetch('/api/portal/uploads', {
        method: 'POST',
        body: formData,
        skipDefaultContentType: true,
      });
      return res.json();
    },
    async remove(id: number): Promise<void> {
      await bffFetch(`/api/portal/uploads/${id}`, { method: 'DELETE' });
    },
  },
};
