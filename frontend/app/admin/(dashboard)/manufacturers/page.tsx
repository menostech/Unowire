import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

const PAGE_SIZE = 20;

export default async function ManufacturersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = parseInt(sp.page || '1', 10);
  const { items, total } = await adminApi.manufacturers.all(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manufacturers</h1>
        <Link
          href="/admin/manufacturers/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          New
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Image</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">Img Rec</th>
              <th className="px-4 py-3 font-medium">Text Rec</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {m.image_url ? (
                    <img src={m.image_url} alt={m.name} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200" />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-900">{m.name}</td>
                <td className="px-4 py-3 text-gray-600">{m.country || '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {m.website ? (
                    <a
                      href={m.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {m.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {m.featured_image ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {m.featured_text ? 'Yes' : 'No'}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/manufacturers/${m.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No manufacturers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link
            href={`/admin/manufacturers?page=${page - 1}`}
            className="text-blue-600 hover:underline"
          >
            ← Prev
          </Link>
        ) : (
          <span className="text-gray-300">← Prev</span>
        )}
        <span className="text-gray-600">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={`/admin/manufacturers?page=${page + 1}`}
            className="text-blue-600 hover:underline"
          >
            Next →
          </Link>
        ) : (
          <span className="text-gray-300">Next →</span>
        )}
      </div>
    </div>
  );
}
