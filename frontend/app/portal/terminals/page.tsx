import { Suspense } from 'react';
import Link from 'next/link';
import { portalApi } from '@/lib/portalApi';
import { TerminalListToolbar } from '@/components/portal/terminals/TerminalListToolbar';
import type { PortalTerminal } from '@/lib/types/portal';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{ search?: string; category_id?: string; page?: string }>;
}

export default async function PortalTerminalsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  let terminals: PortalTerminal[] = [];
  let total = 0;
  try {
    const result = await portalApi.terminals.all({
      search: sp.search,
      category_id: sp.category_id,
      page,
      page_size: PAGE_SIZE,
    });
    terminals = result.items;
    total = result.total;
  } catch {
    // empty state
  }

  // Fetch categories for the toolbar dropdown (flat list).
  let categories: { id: string; label: string; parent_label?: string | null }[] = [];
  try {
    const tree = await portalApi.terminalCategories?.all?.() ?? [];
    categories = tree.flatMap((parent) => {
      const self = { id: parent.id, label: parent.label, parent_label: null as string | null };
      const children = (parent.children ?? []).map((child) => ({
        id: child.id,
        label: child.label,
        parent_label: parent.label,
      }));
      return [self, ...children];
    });
  } catch {
    // empty categories
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(p: number): string {
    const params = new URLSearchParams({ page: String(p) });
    if (sp.search) params.set('search', sp.search);
    if (sp.category_id) params.set('category_id', sp.category_id);
    return `/portal/terminals?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Terminals</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/terminals/import"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import
          </Link>
          <Link
            href="/portal/terminals/new"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Terminal
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <TerminalListToolbar categories={categories} />
      </Suspense>

      {terminals.length === 0 ? (
        <p className="empty-state text-sm text-gray-500">No terminals in your scope yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {terminals.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{t.model || t.id}</td>
                  <td className="px-4 py-3 text-gray-600">{t.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/portal/terminals/${t.id}`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link href={buildPageHref(page - 1)} className="text-blue-600 hover:underline">← Prev</Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">Page {page} of {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildPageHref(page + 1)} className="text-blue-600 hover:underline">Next →</Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
