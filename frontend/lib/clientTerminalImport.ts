// Client-side connectivity import module — safe to import from 'use client' components.
// Mirrors clientCableImport but targets /api/admin/connectivity/import/*.

export type {
  ImportFormat,
  RowStatus,
  ImportPreviewRow,
  ImportPreview,
  ImportResult,
} from '@/lib/clientCableImport';

import type { ImportFormat, ImportPreview, ImportResult } from '@/lib/clientCableImport';

export async function validateImport(file: File, format: ImportFormat): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/connectivity/import/validate', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Validation failed');
  return data as ImportPreview;
}

export async function commitImport(file: File, format: ImportFormat): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);
  const res = await fetch('/api/admin/connectivity/import/commit', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Commit failed');
  return data as ImportResult;
}

export async function downloadCsvTemplate(): Promise<Blob> {
  const res = await fetch('/api/admin/connectivity/import/csv-template');
  if (!res.ok) throw new Error('Failed to download CSV template');
  return res.blob();
}

export async function downloadJsonExample(): Promise<Blob> {
  const res = await fetch('/api/admin/connectivity/import/json-example');
  if (!res.ok) throw new Error('Failed to download JSON example');
  return res.blob();
}

export { triggerBlobDownload } from '@/lib/clientCableImport';
