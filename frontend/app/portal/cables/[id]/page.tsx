import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { CableEditForm } from '@/components/portal/form/CableEditForm';
import type { TaxonomyIndustry } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalCableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cable: any;
  try {
    cable = await portalApi.cables.getById(id);
  } catch {
    notFound();
  }

  // Fetch taxonomy tree (public endpoint, no auth needed)
  let taxonomy: TaxonomyIndustry[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/taxonomy`, { cache: 'no-store' });
    if (res.ok) taxonomy = await res.json();
  } catch {
    // taxonomy fetch failure is non-fatal — form will show empty dropdowns
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{cable.model || cable.slug || 'Cable'}</h1>
      <CableEditForm cable={cable} taxonomy={taxonomy} />
    </div>
  );
}
