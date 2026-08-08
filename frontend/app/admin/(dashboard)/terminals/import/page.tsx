'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, FileText, ArrowLeft, Download } from 'lucide-react';
import {
  validateImport,
  commitImport,
  downloadCsvTemplate,
  downloadJsonExample,
  triggerBlobDownload,
  type ImportFormat,
  type ImportPreview,
  type ImportResult,
} from '@/lib/clientTerminalImport';
import { ImportPreviewTable } from '@/components/admin/cable/ImportPreviewTable';

type Stage = 'upload' | 'preview' | 'result';

export default function TerminalImportPage() {
  const [stage, setStage] = useState<Stage>('upload');
  const [format, setFormat] = useState<ImportFormat>('csv');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function resetToUpload() {
    setStage('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }

  function handleFileSelected(f: File | null) {
    if (f === null) {
      setFile(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File too large (max 5MB)');
      return;
    }
    setError(null);
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  }

  async function handleValidate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const p = await validateImport(file, format);
      setPreview(p);
      setStage('preview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const r = await commitImport(file, format);
      setResult(r);
      setStage('result');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCsvTemplate() {
    try {
      const blob = await downloadCsvTemplate();
      triggerBlobDownload(blob, 'terminal-import-template.csv');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDownloadJsonExample() {
    try {
      const blob = await downloadJsonExample();
      triggerBlobDownload(blob, 'terminal-import-example.json');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/terminals"
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Import Terminals</h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}

      {stage === 'upload' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="csv"
                    checked={format === 'csv'}
                    onChange={() => setFormat('csv')}
                    className="text-accent-foreground"
                  />
                  <span className="text-sm text-gray-700">CSV (basic fields)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="json"
                    checked={format === 'json'}
                    onChange={() => setFormat('json')}
                    className="text-accent-foreground"
                  />
                  <span className="text-sm text-gray-700">JSON (full nested)</span>
                </label>
              </div>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-accent-foreground/60 bg-accent' : 'border-gray-300 hover:border-accent-foreground/60'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('terminal-import-input')?.click()}
            >
              <input
                id="terminal-import-input"
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  handleFileSelected(f);
                }}
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-3" />
              <p className="text-gray-600">
                {file ? (
                  <span className="font-medium text-gray-900">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                ) : (
                  'Drop file here or click to select'
                )}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Supports .csv / .json — max 5MB, 500 rows
              </p>
            </div>

            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="flex items-center gap-1 text-accent-foreground hover:underline"
              >
                <Download className="h-4 w-4" />
                Download CSV template
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonExample}
                className="flex items-center gap-1 text-accent-foreground hover:underline"
              >
                <FileText className="h-4 w-4" />
                View JSON example
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleValidate}
                disabled={!file || loading}
                className="px-4 py-2 text-sm font-medium text-background bg-accent-foreground rounded hover:brightness-95 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Validating...' : 'Validate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'preview' && preview && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Preview — {preview.total_rows} rows total
              </h2>
              <div className="flex gap-4 text-sm">
                <span className="text-green-700">
                  ✓ {preview.valid_count} valid
                </span>
                <span className="text-yellow-700">
                  ⏭ {preview.skipped_count} skipped
                </span>
                <span className="text-red-700">
                  ✗ {preview.error_count} errors
                </span>
              </div>
            </div>

            <ImportPreviewTable rows={preview.rows} />
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStage('upload')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={preview.valid_count === 0 || loading}
              className="px-4 py-2 text-sm font-medium text-background bg-accent-foreground rounded hover:brightness-95 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Committing...' : `Commit ${preview.valid_count} valid rows`}
            </button>
          </div>
        </div>
      )}

      {stage === 'result' && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Import Complete</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium text-gray-900">{result.created_count}</span> terminals created</p>
              <p><span className="font-medium text-gray-900">{result.skipped_count}</span> terminals skipped (already existed)</p>
              {result.errors.length > 0 && (
                <p className="text-red-600">{result.errors.length} errors</p>
              )}
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <Link
                href="/admin/terminals"
                className="px-4 py-2 text-sm font-medium text-background bg-accent-foreground rounded hover:brightness-95"
              >
                View Terminals List
              </Link>
              <button
                type="button"
                onClick={resetToUpload}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Import Another File
              </button>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 text-left bg-red-50 border border-red-200 rounded p-3">
                <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
