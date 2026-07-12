import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { MenuItemForm } from '@/components/admin/form/MenuItemForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMenuItemPage({ params }: PageProps) {
  const { id } = await params;
  const [item, allItems] = await Promise.all([
    adminApi.adminMenu.getById(id),
    adminApi.adminMenu.all(),
  ]);
  if (!item) notFound();

  // Exclude self and non-group items from parent options.
  const parentOptions = allItems
    .filter((i) => i.type === 'group' && i.parent_id === null && i.id !== id)
    .map((i) => ({ id: i.id, label: i.label }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/menu" className="hover:underline">
          Menu Items
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{item.label}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Menu Item</h1>
      <MenuItemForm initial={item} parentOptions={parentOptions} />
    </div>
  );
}
