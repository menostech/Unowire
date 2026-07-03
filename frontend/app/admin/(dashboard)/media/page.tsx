'use client';

import { useState, useEffect } from 'react';
import { Trash2, Copy, Check, Download, Image as ImageIcon } from 'lucide-react';
import { adminApi } from '@/lib/adminApi';
import { MediaUploader } from '@/components/admin/form/MediaUploader';
import type { BackendUpload } from '@/lib/adminApi';

export default function MediaPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [items, setItems] = useState<BackendUpload[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMedia();
  }, [currentPage]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const result = await adminApi.taxonomy.uploads.list(currentPage, pageSize);
      setItems(result.items);
      setTotal(result.total);
      setPageSize(result.page_size);
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDelete = async (id: number) => {
    try {
      await adminApi.taxonomy.uploads.delete(id);
      setDeleteConfirmId(null);
      loadMedia();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
        </div>
      </div>

      <MediaUploader />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">Showing {items.length} of {total} files</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
            {items.map((upload: BackendUpload) => (
              <div
                key={upload.id}
                className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors"
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
                      {copiedUrl === upload.url_path ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={upload.url_path}
                      download={upload.original_filename}
                      className="p-2 bg-white/90 rounded hover:bg-white transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {upload.entity_id === null && (
                      deleteConfirmId === upload.id ? (
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
                      )
                    )}
                  </div>
                </div>

                {upload.entity_id === null && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-gray-800 text-white text-xs rounded">
                    Unassociated
                  </span>
                )}
              </div>
            ))}
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
    </div>
  );
}