import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ location?: string }>;
}

export default async function AdminSiteMenuPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const locationFilter = sp.location && ['header', 'footer'].includes(sp.location)
    ? (sp.location as 'header' | 'footer')
    : undefined;
  const items = await adminApi.siteMenu.all(locationFilter);

  const locationTabs = [
    { label: 'All', value: '' },
    { label: 'Header', value: 'header' },
    { label: 'Footer', value: 'footer' },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Site Menu</h1>
        <Link
          href="/admin/site-menu/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New Item
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {locationTabs.map((tab) => {
          const isActive = (tab.value || '') === (locationFilter || '');
          const href = tab.value ? `/admin/site-menu?location=${tab.value}` : '/admin/site-menu';
          return (
            <Link
              key={tab.value || 'all'}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Parent</th>
              <th className="px-4 py-3 font-medium">Sort</th>
              <th className="px-4 py-3 font-medium">Visible</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-900">{item.label}</td>
                <td className="px-4 py-3 text-gray-600">{item.location}</td>
                <td className="px-4 py-3 text-gray-600">{item.type}</td>
                <td className="px-4 py-3 text-gray-600">{item.url ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.parent_id ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.sort_order}</td>
                <td className="px-4 py-3 text-gray-600">{item.is_visible ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/site-menu/${item.id}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
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
