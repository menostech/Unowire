import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { EquipmentForm } from '@/components/admin/form/EquipmentForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentPage({ params }: PageProps) {
  const { id } = await params;
  const equipment = await adminApi.equipment.getById(id);
  if (!equipment) notFound();

  const [manufacturersResult, categoryTree] = await Promise.all([
    adminApi.equipmentManufacturers.all(1, 999),
    adminApi.equipmentCategories.all(),
  ]);

  const manufacturers = manufacturersResult.items.map((m) => ({ id: m.id, name: m.name }));

  // Flatten categories two levels: top-level (parent_id: null) + children (with parent_label).
  const categories = categoryTree.flatMap((parent) => {
    const self = {
      id: parent.id,
      label: parent.label,
      parent_id: null as string | null,
      parent_label: null as string | null,
    };
    const children = (parent.children ?? []).map((child) => ({
      id: child.id,
      label: child.label,
      parent_id: parent.id,
      parent_label: parent.label,
    }));
    return [self, ...children];
  });

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/equipment" className="hover:underline">
          Equipment
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{equipment.model}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Equipment</h1>
      <EquipmentForm initial={equipment} manufacturers={manufacturers} categories={categories} />
    </div>
  );
}
