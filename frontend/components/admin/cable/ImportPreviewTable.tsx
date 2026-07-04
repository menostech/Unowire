'use client';

import { useState } from 'react';
import type { ImportPreviewRow } from '@/lib/clientCableImport';

interface ImportPreviewTableProps {
  rows: ImportPreviewRow[];
}

const PAGE_SIZE = 20;

export function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  function statusBadge(status: ImportPreviewRow['status']) {
    if (status === 'valid') {
      return <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">valid</span>;
    }
    if (status === 'skipped') {
      return <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700">skipped</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-700">error</span>;
  }

  function rowClass(status: ImportPreviewRow['status']) {
    if (status === 'error') return 'bg-red-50';
    if (status === 'skipped') return 'bg-yellow-50';
    return '';
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium w-16">Row</th>
              <th className="px-4 py-3 font-medium w-24">Status</th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.row_number} className={`border-b border-gray-100 last:border-0 ${rowClass(row.status)}`}>
                <td className="px-4 py-3 text-gray-600">{row.row_number}</td>
                <td className="px-4 py-3">{statusBadge(row.status)}</td>
                <td className="px-4 py-3 text-gray-900 font-mono text-xs">{row.id || '—'}</td>
                <td className="px-4 py-3 text-gray-900">{row.model || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {row.status === 'skipped' && row.errors.length === 0 ? (
                    <span className="text-yellow-600">(already exists)</span>
                  ) : row.errors.length > 0 ? (
                    <ul className="list-disc list-inside text-red-600 text-xs space-y-0.5">
                      {row.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={page === 1 ? 'text-gray-300' : 'text-blue-600 hover:underline'}
          >
            ← Prev
          </button>
          <span className="text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={page === totalPages ? 'text-gray-300' : 'text-blue-600 hover:underline'}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
