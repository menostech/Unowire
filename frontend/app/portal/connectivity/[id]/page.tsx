import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { TerminalEditForm } from '@/components/portal/form/TerminalEditForm';
import { TerminalDeleteButton } from '@/components/portal/form/TerminalDeleteButton';
import type { TerminalCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalTerminalsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let terminal: any;
  try {
    terminal = await portalApi.terminals.getById(id);
  } catch {
    notFound();
  }

  // Fetch terminal categories (public endpoint, no auth needed)
  let categories: TerminalCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/connectivity-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // categories fetch failure is non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{terminal.model || 'Product'}</h1>
      <TerminalEditForm terminal={terminal} categories={categories} />
      <div className="mt-6">
        <TerminalDeleteButton terminalId={terminal.id} terminalName={terminal.model || terminal.id} />
      </div>
    </div>
  );
}

