import type {
  PortalCable,
  PortalCableCreate,
  PortalCableUpdate,
  PortalEquipment,
  PortalEquipmentCreate,
  PortalEquipmentUpdate,
  PortalTerminal,
  PortalTerminalCreate,
  PortalTerminalUpdate,
  PortalFolder,
  PortalFolderCreate,
  PortalInquiry,
  PortalUpload,
  PortalUploadPage,
  PortalMessage,
  PortalMessageListResponse,
} from '@/lib/types/portal';
import type { ImportFormat, ImportPreview, ImportResult } from '@/lib/clientCableImport';

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
    import: {
      async validate(file: File, format: ImportFormat): Promise<ImportPreview> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/cables/import/validate', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async commit(file: File, format: ImportFormat): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/cables/import/commit', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async downloadCsvTemplate(): Promise<Blob> {
        const res = await bffFetch('/api/portal/cables/import/csv-template');
        return res.blob();
      },
      async downloadJsonExample(): Promise<Blob> {
        const res = await bffFetch('/api/portal/cables/import/json-example');
        return res.blob();
      },
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
    import: {
      async validate(file: File, format: ImportFormat): Promise<ImportPreview> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/equipment/import/validate', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async commit(file: File, format: ImportFormat): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/equipment/import/commit', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async downloadCsvTemplate(): Promise<Blob> {
        const res = await bffFetch('/api/portal/equipment/import/csv-template');
        return res.blob();
      },
      async downloadJsonExample(): Promise<Blob> {
        const res = await bffFetch('/api/portal/equipment/import/json-example');
        return res.blob();
      },
    },
  },
  terminals: {
    async create(data: PortalTerminalCreate): Promise<PortalTerminal> {
      const res = await bffFetch('/api/portal/terminals', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async update(id: string, data: PortalTerminalUpdate): Promise<PortalTerminal> {
      const res = await bffFetch(`/api/portal/terminals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    async remove(id: string): Promise<void> {
      await bffFetch(`/api/portal/terminals/${id}`, { method: 'DELETE' });
    },
    import: {
      async validate(file: File, format: ImportFormat): Promise<ImportPreview> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/terminals/import/validate', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async commit(file: File, format: ImportFormat): Promise<ImportResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('format', format);
        const res = await bffFetch('/api/portal/terminals/import/commit', {
          method: 'POST',
          body: formData,
          skipDefaultContentType: true,
        });
        return res.json();
      },
      async csvTemplate(): Promise<Blob> {
        const res = await bffFetch('/api/portal/terminals/import/csv-template');
        return res.blob();
      },
      async jsonExample(): Promise<Blob> {
        const res = await bffFetch('/api/portal/terminals/import/json-example');
        return res.blob();
      },
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
  messages: {
    async all(page = 1, pageSize = 20): Promise<PortalMessageListResponse> {
      const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
      const res = await bffFetch(`/api/portal/messages?${qs}`);
      return res.json();
    },
    async getById(id: number): Promise<PortalMessage> {
      const res = await bffFetch(`/api/portal/messages/${id}`);
      return res.json();
    },
    async unreadCount(): Promise<{ unread: number }> {
      const res = await bffFetch('/api/portal/messages/unread-count');
      return res.json();
    },
  },
};
