// Client-side uploads module — safe to import from 'use client' components.
// Uses relative URLs (/api/admin/uploads) which the browser automatically
// sends cookies with; the Next.js API Route proxy reads the admin_token
// cookie and forwards it as a Bearer header to the FastAPI backend.

export interface BackendUpload {
  id: number;
  filename: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  url_path: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface UploadListResponse {
  items: BackendUpload[];
  total: number;
  page: number;
  page_size: number;
}

const BASE = '/api/admin/uploads';

export async function uploadFile(file: File): Promise<BackendUpload> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(BASE, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function listUploads(
  page = 1,
  pageSize = 20
): Promise<UploadListResponse> {
  const res = await fetch(
    `${BASE}?page=${page}&page_size=${pageSize}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function deleteUpload(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
