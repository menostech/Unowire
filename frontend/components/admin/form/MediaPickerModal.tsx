'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Upload } from 'lucide-react';
import { FolderTree, type FolderSelection } from '@/components/admin/media/FolderTree';
import { MediaGrid } from '@/components/admin/media/MediaGrid';
import { MediaUploader } from '@/components/admin/form/MediaUploader';
import { listFolders, type Folder } from '@/lib/clientFolders';

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (urlPath: string) => void;
}

export function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);

  const refreshFolders = useCallback(async () => {
    try {
      const data = await listFolders();
      setFolders(data);
    } catch (e) {
      console.error('Failed to load folders:', e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      refreshFolders();
    }
  }, [open, refreshFolders]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  function handleUploaded(_urlPath: string) {
    refreshFolders();
    setGridRefreshKey(k => k + 1);
  }

  function handleSelect(urlPath: string) {
    onSelect(urlPath);
    onClose();
  }

  const currentFolderId: number | undefined =
    typeof selectedFolder === 'number' ? selectedFolder : undefined;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Select Media</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUploaderOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-foreground text-background rounded hover:brightness-95 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {uploaderOpen ? 'Close Uploader' : 'Upload'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
            {toast}
          </div>
        )}

        {/* Optional upload area */}
        {uploaderOpen && (
          <div className="border-b p-4">
            <MediaUploader folderId={currentFolderId} onUploaded={handleUploaded} />
          </div>
        )}

        {/* Main body: folder tree + media grid */}
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-64 border-r overflow-y-auto p-2">
            <FolderTree
              folders={folders}
              selectedId={selectedFolder}
              onSelect={setSelectedFolder}
              onRefresh={refreshFolders}
              onToast={showToast}
            />
          </aside>
          <div className="flex-1 overflow-y-auto p-4">
            <MediaGrid
              folderId={selectedFolder}
              folders={folders}
              onToast={showToast}
              onFoldersChanged={refreshFolders}
              refreshKey={gridRefreshKey}
              onSelect={handleSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
