import { TerminalCreateForm } from '@/components/portal/form/TerminalCreateForm';
import type { TerminalCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalTerminalsNewPage() {
  // Fetch terminal categories (public endpoint, no auth needed).
  // On failure, pass an empty array — the form will show an empty dropdown
  // (acceptable degradation).
  let categories: TerminalCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/connectivity-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // categories fetch failure is non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Add Product</h1>
      <TerminalCreateForm categories={categories} />
    </div>
  );
}

