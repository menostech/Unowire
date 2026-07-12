import { adminApi } from '@/lib/adminApi';
import { MenuItemForm } from '@/components/admin/form/MenuItemForm';

export default async function NewMenuItemPage() {
  // Fetch existing top-level groups to populate parent select.
  const items = await adminApi.adminMenu.all();
  const parentOptions = items
    .filter((i) => i.type === 'group' && i.parent_id === null)
    .map((i) => ({ id: i.id, label: i.label }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Menu Item</h1>
      <MenuItemForm parentOptions={parentOptions} />
    </div>
  );
}
