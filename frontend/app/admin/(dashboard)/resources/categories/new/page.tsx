import { ResourceCategoryForm } from '@/components/admin/form/ResourceCategoryForm';
import { adminApi } from '@/lib/adminApi';

export default async function NewResourceCategoryPage() {
  const tree = await adminApi.resourceCategories.all();
  const topCategories = tree.map((c) => ({ id: c.id, label: c.label }));
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Resource Category</h1>
      <ResourceCategoryForm topCategories={topCategories} />
    </div>
  );
}
