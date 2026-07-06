'use client';

import { useState } from 'react';
import { Upload, X, Copy, Check } from 'lucide-react';
import { uploadFile } from '@/lib/clientUploads';

interface UploadResult {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  url?: string;
  error?: string;
}

interface MediaUploaderProps {
  folderId?: number;
  onUploaded?: (urlPath: string) => void;
}

export function MediaUploader({ folderId, onUploaded }: MediaUploaderProps) {
  const [uploads, setUploads] = useState<UploadResult[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleFiles = (files: File[]) => {
    const newUploads: UploadResult[] = Array.from(files).map((file) => ({
      file,
      status: 'pending',
      progress: 0,
    }));
    setUploads((prev) => [...newUploads, ...prev]);
    newUploads.forEach((item) => processUpload(item));
  };

  const processUpload = async (item: UploadResult) => {
    setUploads((prev) =>
      prev.map((u) => (u.file.name === item.file.name ? { ...u, status: 'uploading' } : u))
    );

    try {
      const result = await uploadFile(item.file, folderId);
      setUploads((prev) =>
        prev.map((u) =>
          u.file.name === item.file.name ? { ...u, status: 'success', progress: 100, url: result.url_path } : u
        )
      );
      if (onUploaded) onUploaded(result.url_path);
    } catch (error) {
      setUploads((prev) =>
        prev.map((u) =>
          u.file.name === item.file.name ? { ...u, status: 'error', error: (error as Error).message } : u
        )
      );
    }
  };

  const removeUpload = (fileName: string) => {
    setUploads((prev) => prev.filter((u) => u.file.name !== fileName));
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) handleFiles(files);
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById('media-upload-input')?.click()}
      >
        <input
          id="media-upload-input"
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFiles(files);
          }}
        />
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-600">Drop images here or click to select</p>
        <p className="text-sm text-gray-400 mt-2">PNG, JPG, WebP — max 5MB per file</p>
      </div>

      <div className="space-y-2">
        {uploads.map((upload) => (
          <div
            key={upload.file.name}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-shrink-0">
              {upload.status === 'success' && upload.url ? (
                <img src={upload.url} alt={upload.file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center">
                  {upload.status === 'uploading' && (
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {upload.status === 'error' && (
                    <X className="w-5 h-5 text-red-500" />
                  )}
                  {upload.status === 'pending' && (
                    <Upload className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{upload.file.name}</p>
              {upload.status === 'uploading' && (
                <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                  <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${upload.progress}%` }} />
                </div>
              )}
              {upload.status === 'error' && (
                <p className="text-xs text-red-500">{upload.error}</p>
              )}
              {upload.status === 'success' && upload.url && (
                <p className="text-xs text-gray-500 truncate">{upload.url}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {upload.status === 'success' && upload.url && (
                <button
                  onClick={() => copyUrl(upload.url)}
                  className="p-2 text-gray-500 hover:text-blue-500 transition-colors"
                  title="Copy URL"
                >
                  {copiedUrl === upload.url ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => removeUpload(upload.file.name)}
                className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
