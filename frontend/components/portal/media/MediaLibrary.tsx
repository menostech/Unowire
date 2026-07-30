'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FolderPlus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { portalApiClient, PortalApiError } from '@/lib/portalApiClient';
import { DeleteConfirmDialog } from '@/components/portal/form/DeleteConfirmDialog';
import type { PortalFolder, PortalUpload, PortalUploadPage } from '@/lib/types/portal';

interface MediaLibraryProps {
  initialFolders: PortalFolder[];
  initialUploads: PortalUploadPage;
}

export function MediaLibrary({ initialFolders, initialUploads }: MediaLibraryProps) {
  const [folders, setFolders] = useState<PortalFolder[]>(initialFolders);
  const [uploads, setUploads] = useState<PortalUploadPage>(initialUploads);
  const [selectedFolder, setSelectedFolder] = useState<'all' | number>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PortalUpload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const didMount = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refresh uploads for the current folder/page. Reused by the effect and the
  // upload/delete handlers so fetch logic lives in one place.
  async function refreshUploads() {
    setIsLoading(true);
    try {
      const data = await portalApiClient.uploads.all({
        folderId: selectedFolder === 'all' ? undefined : selectedFolder,
        page: currentPage,
        pageSize: 20,
      });
      setUploads(data);
    } catch (err) {
      setErrorMessage(err instanceof PortalApiError ? err.message : 'Failed to load uploads');
    } finally {
      setIsLoading(false);
    }
  }

  // Re-fetch uploads when folder or page changes, but skip the initial render
  // (data is already provided by SSR props).
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    refreshUploads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolder, currentPage]);

  async function refreshFolders() {
    try {
      const data = await portalApiClient.folders.all();
      setFolders(data);
    } catch (err) {
      setErrorMessage(err instanceof PortalApiError ? err.message : 'Failed to load folders');
    }
  }

  function selectFolder(id: 'all' | number) {
    setSelectedFolder(id);
    setCurrentPage(1);
  }

  async function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetFolderId = selectedFolder === 'all' ? folders[0]?.id : selectedFolder;
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
      await Promise.all([refreshUploads(), refreshFolders()]);
    } catch (err) {
      setErrorMessage(err instanceof PortalApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setErrorMessage('');
    try {
      await portalApiClient.folders.create({ name, parent_id: null });
      await refreshFolders();
      setNewFolderName('');
      setCreatingFolder(false);
    } catch (err) {
      setErrorMessage(err instanceof PortalApiError ? err.message : 'Failed to create folder');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await portalApiClient.uploads.remove(deleteTarget.id);
    setDeleteTarget(null);
    await Promise.all([refreshUploads(), refreshFolders()]);
  }

  const totalPages = Math.max(1, Math.ceil(uploads.total / uploads.page_size));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadChange}
        />
        <button
          type="button"
          onClick={() => setCreatingFolder((v) => !v)}
          className="flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <FolderPlus className="h-4 w-4" />
          New Folder
        </button>
        {creatingFolder && (
          <div className="flex items-center gap-2">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
              }}
              placeholder="Folder name"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {/* Main grid: folder sidebar + uploads grid */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Folder sidebar */}
        <div className="w-full shrink-0 rounded-lg bg-white p-4 shadow-sm lg:w-96">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Folders</h2>
          {folders.length === 0 ? (
            <p className="text-xs text-gray-500">No folders.</p>
          ) : (
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => selectFolder('all')}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    selectedFolder === 'all'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
              </li>
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => selectFolder(f.id)}
                    className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                      selectedFolder === f.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-gray-400">({f.upload_count})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Uploads grid + pagination */}
        <div className="flex-1 min-w-0 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Uploads ({uploads.total})
          </h2>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : uploads.items.length === 0 ? (
            <p className="text-sm text-gray-500">No uploads.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {uploads.items.map((u) => (
                <div
                  key={u.id}
                  className="group relative overflow-hidden rounded border border-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u.url_path}
                    alt={u.filename}
                    className="h-20 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(u)}
                    title="Delete"
                    className="absolute right-1 top-1 rounded bg-white/90 p-1 text-gray-700 opacity-0 transition-colors hover:bg-red-500 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title="Delete file"
        message="Are you sure you want to delete this file? This action cannot be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
