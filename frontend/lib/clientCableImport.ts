// Client-side cable import module — safe to import from 'use client' components.
// Uses relative URLs (/api/admin/cables/import/*) which the browser automatically
// sends cookies with; the Next.js API Route proxy reads admin_token cookie and
// forwards as Bearer header to FastAPI.

export type ImportFormat = 'csv' | 'json';
export type RowStatus = 'valid' | 'skipped' | 'error';

export interface ImportPreviewRow {
  row_number: number;
  status: RowStatus;
  id: string | null;
  model: string | null;
  errors: string[];
}

export interface ImportPreview {
  total_rows: number;
  valid_count: number;
  skipped_count: number;
  error_count: number;
  rows: ImportPreviewRow[];
  file_format: ImportFormat;
}

export interface ImportResult {
  created_count: number;
  skipped_count: number;
  errors: string[];
}

export async function validateImport(
  file: File,
  format: ImportFormat
): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/validate', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Validation failed');
  }
  return data as ImportPreview;
}

export async function commitImport(
  file: File,
  format: ImportFormat
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/cables/import/commit', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Commit failed');
  }
  return data as ImportResult;
}

export async function downloadCsvTemplate(): Promise<Blob> {
  const res = await fetch('/api/admin/cables/import/csv-template', {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to download CSV template');
  }
  return res.blob();
}

export async function downloadJsonExample(): Promise<Blob> {
  const res = await fetch('/api/admin/cables/import/json-example', {
    method: 'GET',
  });
  if (!res.ok) {
    throw new Error('Failed to download JSON example');
  }
  return res.blob();
}

/** Helper to trigger browser download of a Blob with a given filename. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
