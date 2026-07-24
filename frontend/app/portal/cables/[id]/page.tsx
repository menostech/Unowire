import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { CableEditForm } from '@/components/portal/form/CableEditForm';

export default async function PortalCableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let cable: any;
  try {
    cable = await portalApi.cables.getById(id);
  } catch {
    notFound();
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{cable.model || cable.slug || 'Cable'}</h1>
      <CableEditForm cable={cable} />
    </div>
  );
}
