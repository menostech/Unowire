import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { MenuSortButtons } from '@/components/admin/menu/MenuSortButtons';
import type { MenuItem } from '@/lib/types';

export default async function MenuListPage() {
  const items = await adminApi.adminMenu.all();

  const topLevel = items.filter((i) => i.parent_id === null);
  const childrenOf = (parentId: string) =>
    items.filter((i) => i.parent_id === parentId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Menu Items</h1>
        <Link
          href="/admin/menu/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          + New Item
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topLevel.flatMap((parent) => {
              const children = childrenOf(parent.id);
              return [
                <Row key={parent.id} item={parent} />,
                ...children.map((child) => (
                  <Row key={child.id} item={child} isChild />
                )),
              ];
            })}
            {topLevel.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No menu items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ item, isChild = false }: { item: MenuItem; isChild?: boolean }) {
  return (
    <tr className={`border-b border-gray-100 last:border-0 ${isChild ? 'bg-gray-50' : ''}`}>
      <td className={`px-4 py-3 ${isChild ? 'pl-8' : ''} ${item.is_visible ? 'text-gray-900' : 'text-gray-400'}`}>
        {isChild ? '↳ ' : ''}{item.label}
        {!item.is_visible && (
          <span className="ml-2 text-xs text-gray-400">(Hidden)</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.type}</td>
      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
        {item.type === 'page' && item.page_id}
        {item.type === 'link' && item.url}
        {item.type === 'group' && '—'}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.sort_order}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <MenuSortButtons id={item.id} />
          <Link
            href={`/admin/menu/${encodeURIComponent(item.id)}`}
            className="text-blue-600 hover:underline"
          >
            Edit
          </Link>
        </div>
      </td>
    </tr>
  );
}
