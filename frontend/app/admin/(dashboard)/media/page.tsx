'use client';

import { useState, useEffect, useCallback } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { FolderTree, type FolderSelection } from '@/components/admin/media/FolderTree';
import { MediaGrid } from '@/components/admin/media/MediaGrid';
import { MediaUploader } from '@/components/admin/form/MediaUploader';
import { listFolders, type Folder } from '@/lib/clientFolders';

export default function MediaPage() {
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

  const handleUploaded = useCallback((_urlPath: string) => {
    refreshFolders();
    setGridRefreshKey(k => k + 1);
  }, [refreshFolders]);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  const currentFolderId: number | undefined =
    typeof selectedFolder === 'number' ? selectedFolder : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-accent-foreground" />
          <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
        </div>
        <button
          onClick={() => setUploaderOpen((v) => !v)}
          className="px-3 py-1.5 text-sm bg-accent-foreground text-background rounded hover:brightness-95 transition-colors"
        >
          {uploaderOpen ? 'Close Uploader' : 'Upload'}
        </button>
      </div>

      {toast && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {toast}
        </div>
      )}

      {uploaderOpen && (
        <MediaUploader folderId={currentFolderId} onUploaded={handleUploaded} />
      )}

      <div className="flex gap-4">
        <aside className="w-96 shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-3 max-h-[calc(100vh-200px)] overflow-y-auto">
          <FolderTree
            folders={folders}
            selectedId={selectedFolder}
            onSelect={setSelectedFolder}
            onRefresh={refreshFolders}
            onToast={showToast}
          />
        </aside>

        <div className="flex-1 min-w-0">
          <MediaGrid
            folderId={selectedFolder}
            folders={folders}
            onToast={showToast}
            onFoldersChanged={refreshFolders}
            refreshKey={gridRefreshKey}
          />
        </div>
      </div>
    </div>
  );
}
