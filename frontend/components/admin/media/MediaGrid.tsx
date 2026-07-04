'use client';

import { useState, useEffect } from 'react';
import { Trash2, Copy, Check, Download, Pencil, Move } from 'lucide-react';
import {
  listUploads,
  deleteUpload,
  updateUpload,
  moveUpload,
  type BackendUpload,
  type FolderFilter,
} from '@/lib/clientUploads';
import type { Folder } from '@/lib/clientFolders';

interface MediaGridProps {
  folderId: FolderFilter;
  folders: Folder[];
  onToast: (message: string) => void;
  onFoldersChanged: () => void;
  refreshKey?: number;
}

export function MediaGrid({ folderId, folders, onToast, onFoldersChanged, refreshKey }: MediaGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [items, setItems] = useState<BackendUpload[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [movingId, setMovingId] = useState<number | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [folderId]);

  useEffect(() => {
    loadMedia();
  }, [currentPage, folderId, refreshKey]);

  async function loadMedia() {
    setLoading(true);
    try {
      const result = await listUploads(currentPage, 20, folderId);
      setItems(result.items);
      setTotal(result.total);
      setPageSize(result.page_size);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  async function handleDelete(id: number) {
    try {
      await deleteUpload(id);
      setDeleteConfirmId(null);
      loadMedia();
      onFoldersChanged();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  }

  async function handleRename(id: number) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateUpload(id, renameValue.trim());
      setRenamingId(null);
      loadMedia();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  async function handleMove(id: number, target: number | null) {
    try {
      await moveUpload(id, target);
      setMovingId(null);
      setMoveTarget(null);
      loadMedia();
      onFoldersChanged();
    } catch (e) {
      onToast((e as Error).message);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {items.length} of {total} files
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No files in this folder.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
          {items.map((upload) => (
            <div
              key={upload.id}
              className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(upload.id);
              }}
            >
              <img
                src={upload.url_path}
                alt={upload.original_filename}
                className="w-full aspect-square object-cover"
              />

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                <div className="flex items-center justify-between gap-1">
                  <button
                    onClick={() => copyUrl(upload.url_path)}
                    className="p-2 bg-white/90 rounded hover:bg-white transition-colors"
                    title="Copy URL"
                  >
                    {copiedUrl === upload.url_path ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  <a
                    href={upload.url_path}
                    download={upload.original_filename}
                    className="p-2 bg-white/90 rounded hover:bg-white transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                  {upload.entity_id === null &&
                    (deleteConfirmId === upload.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(upload.id)}
                          className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="p-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(upload.id)}
                        className="p-2 bg-white/90 rounded hover:bg-red-500 hover:text-white transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ))}
                </div>
              </div>

              <div className="px-2 py-1 bg-gray-50 border-t text-xs text-gray-600 truncate">
                {renamingId === upload.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(upload.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(upload.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none"
                  />
                ) : (
                  upload.original_filename
                )}
              </div>

              {upload.entity_id === null && (
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-gray-800 text-white text-xs rounded">
                  Unassociated
                </span>
              )}

              {menuFor === upload.id && (
                <div className="fixed inset-0 z-50" onClick={() => setMenuFor(null)}>
                  <div
                    className="absolute bg-white border border-gray-200 rounded shadow-lg py-1 text-sm"
                    style={{ left: '40%', top: '40%' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setMovingId(upload.id);
                        setMoveTarget(upload.folder_id);
                        setMenuFor(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      <Move className="w-3.5 h-3.5" /> Move to...
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(upload.id);
                        setRenameValue(upload.original_filename);
                        setMenuFor(null);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Rename
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {movingId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setMovingId(null)}>
          <div className="bg-white rounded-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-3">Move to folder</h3>
            <select
              value={moveTarget === null ? 'root' : String(moveTarget)}
              onChange={(e) => setMoveTarget(e.target.value === 'root' ? null : Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm mb-3"
            >
              <option value="root">Root (Unfiled)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setMovingId(null)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMove(movingId, moveTarget)}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 text-sm border rounded ${
                currentPage === page ? 'bg-blue-500 text-white' : 'hover:bg-gray-50'
              }`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
