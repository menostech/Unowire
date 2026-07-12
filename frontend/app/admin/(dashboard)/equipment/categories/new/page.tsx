import { EquipmentCategoryForm } from '@/components/admin/form/EquipmentCategoryForm';
import { adminApi } from '@/lib/adminApi';

export default async function NewEquipmentCategoryPage() {
  const tree = await adminApi.equipmentCategories.all();
  const topCategories = tree.map((c) => ({ id: c.id, label: c.label }));
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Equipment Category</h1>
      <EquipmentCategoryForm topCategories={topCategories} />
    </div>
  );
}
