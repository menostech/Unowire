import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { EquipmentEditForm } from '@/components/portal/form/EquipmentEditForm';

export default async function PortalEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let equipment: any;
  try {
    equipment = await portalApi.equipment.getById(id);
  } catch {
    notFound();
  }
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{equipment.model || 'Equipment'}</h1>
      <EquipmentEditForm equipment={equipment} />
    </div>
  );
}
