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
  folder_id: number | null;
  created_at: string;
}

export interface UploadListResponse {
  items: BackendUpload[];
  total: number;
  page: number;
  page_size: number;
}

export type FolderFilter = 'all' | 'unfiled' | number;

const BASE = '/api/admin/uploads';

export async function uploadFile(file: File, folderId?: number): Promise<BackendUpload> {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId !== undefined) {
    formData.append('folder_id', String(folderId));
  }
  const res = await fetch(BASE, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function listUploads(
  page = 1,
  pageSize = 20,
  folderId: FolderFilter = 'all'
): Promise<UploadListResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  if (folderId === 'unfiled') {
    params.set('folder_id', 'none');
  } else if (folderId !== 'all') {
    params.set('folder_id', String(folderId));
  }
  const res = await fetch(`${BASE}?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export async function deleteUpload(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function updateUpload(
  id: number,
  originalFilename: string
): Promise<BackendUpload> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ original_filename: originalFilename }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Rename failed: ${res.status}`);
  }
  return res.json();
}

export async function moveUpload(id: number, folderId: number | null): Promise<BackendUpload> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_id: folderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Move failed: ${res.status}`);
  }
  return res.json();
}
