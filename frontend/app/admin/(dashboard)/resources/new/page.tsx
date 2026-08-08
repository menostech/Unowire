import { adminApi } from '@/lib/adminApi';
import { ResourceForm } from '@/components/admin/form/ResourceForm';

export default async function NewResourcePage() {
  const categoryTree = await adminApi.resourceCategories.all();

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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Resource</h1>
      <ResourceForm categories={categories} />
    </div>
  );
}
