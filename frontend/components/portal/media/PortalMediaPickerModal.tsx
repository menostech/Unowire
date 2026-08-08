'use client';

import { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import type { PortalFolder, PortalUploadPage } from '@/lib/types/portal';

interface PortalMediaPickerModalProps {
  open: boolean;
  onSelect: (urlPath: string) => void;
  onClose: () => void;
}

export function PortalMediaPickerModal({ open, onSelect, onClose }: PortalMediaPickerModalProps) {
  const [folders, setFolders] = useState<PortalFolder[]>([]);
  const [uploads, setUploads] = useState<PortalUploadPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  const [selectedFolder, setSelectedFolder] = useState<'all' | number>('all');
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // When the modal opens, or the selected folder changes, fetch folders and
  // the first page of uploads for the current folder filter.
  useEffect(() => {
    if (!open) return;
    setErrorMessage('');
    const folderId = typeof selectedFolder === 'number' ? selectedFolder : undefined;
    portalApiClient.folders
      .all()
      .then(setFolders)
      .catch((err) => {
        setErrorMessage(err instanceof PortalApiError ? err.message : 'Failed to load folders');
      });
    portalApiClient.uploads
      .all({ folderId, page: 1, pageSize: 20 })
      .then(setUploads)
      .catch((err) => {
        setErrorMessage(err instanceof PortalApiError ? err.message : 'Failed to load uploads');
      });
  }, [open, selectedFolder]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  function handleSelect(urlPath: string) {
    onSelect(urlPath);
    onClose();
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetFolderId =
      typeof selectedFolder === 'number' ? selectedFolder : folders[0]?.id;
    if (targetFolderId === undefined) {
      setErrorMessage('Create a folder first.');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setErrorMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', String(targetFolderId));
      await portalApiClient.uploads.create(formData);
      const folderId = typeof selectedFolder === 'number' ? selectedFolder : undefined;
      const [f, u] = await Promise.all([
        portalApiClient.folders.all(),
        portalApiClient.uploads.all({ folderId, page: 1, pageSize: 20 }),
      ]);
      setFolders(f);
      setUploads(u);
    } catch (err) {
      setErrorMessage(err instanceof PortalApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Select Media</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setUploaderOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded bg-accent-foreground px-3 py-1.5 text-sm text-background transition-colors hover:brightness-95"
            >
              <Upload className="h-4 w-4" />
              {uploaderOpen ? 'Close' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="border-b bg-red-50 px-6 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Optional upload area */}
        {uploaderOpen && (
          <div className="border-b p-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadChange}
              disabled={uploading}
              className="text-sm"
            />
            {uploading && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
          </div>
        )}

        {/* Main body: folder sidebar + uploads grid */}
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 overflow-y-auto border-r p-2">
            <button
              type="button"
              onClick={() => setSelectedFolder('all')}
              className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                selectedFolder === 'all'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFolder(f.id)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                  selectedFolder === f.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-xs text-gray-400">({f.upload_count})</span>
              </button>
            ))}
          </aside>
          <div className="flex-1 overflow-y-auto p-4">
            {uploads.items.length === 0 ? (
              <p className="text-sm text-gray-500">No uploads.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {uploads.items.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u.url_path)}
                    className="group overflow-hidden rounded border border-gray-200 transition-colors hover:border-accent-foreground/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u.url_path}
                      alt={u.filename}
                      className="h-24 w-full object-cover"
                    />
                    <div className="truncate bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      {u.filename}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
