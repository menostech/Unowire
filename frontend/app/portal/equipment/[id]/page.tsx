import { notFound } from 'next/navigation';
import { portalApi } from '@/lib/portalApi';
import { EquipmentEditForm } from '@/components/portal/form/EquipmentEditForm';
import { EquipmentDeleteButton } from '@/components/portal/form/EquipmentDeleteButton';
import type { EquipmentCategoryTree } from '@/lib/types/portal';

const API_BASE = process.env.INTERNAL_API_BASE || 'http://backend:8000';

export default async function PortalEquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let equipment: any;
  try {
    equipment = await portalApi.equipment.getById(id);
  } catch {
    notFound();
  }

  // Fetch equipment categories (public endpoint, no auth needed)
  let categories: EquipmentCategoryTree[] = [];
  try {
    const res = await fetch(`${API_BASE}/api/equipment-categories`, { cache: 'no-store' });
    if (res.ok) categories = await res.json();
  } catch {
    // categories fetch failure is non-fatal
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{equipment.model || 'Equipment'}</h1>
      <EquipmentEditForm equipment={equipment} categories={categories} />
      <div className="mt-6">
        <EquipmentDeleteButton equipmentId={equipment.id} equipmentName={equipment.model || equipment.id} />
      </div>
    </div>
  );
}
