import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function AdminDashboardPage() {
  const [cables, brands, manufacturers] = await Promise.all([
    adminApi.cables.all(1, 1),
    adminApi.brands.all(1, 1),
    adminApi.manufacturers.all(1, 1),
  ]);

  const cards = [
    { title: 'Cables', count: cables.total, href: '/admin/cables' },
    { title: 'Brands', count: brands.total, href: '/admin/brands' },
    { title: 'Manufacturers', count: manufacturers.total, href: '/admin/manufacturers' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">{card.title}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{card.count}</p>
            <Link
              href={card.href}
              className="mt-4 inline-block text-sm text-blue-600 hover:underline"
            >
              Manage →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
