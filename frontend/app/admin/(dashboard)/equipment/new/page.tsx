import { adminApi } from '@/lib/adminApi';
import { EquipmentForm } from '@/components/admin/form/EquipmentForm';

export default async function NewEquipmentPage() {
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Equipment</h1>
      <EquipmentForm manufacturers={manufacturers} categories={categories} />
    </div>
  );
}
