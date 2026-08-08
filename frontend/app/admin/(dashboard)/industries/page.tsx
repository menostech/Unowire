import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';

export default async function IndustriesPage() {
  const industries = await adminApi.taxonomy.industries.all();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Industries</h1>
        <Link
          href="/admin/industries/new"
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
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {industries.map((ind) => (
              <tr key={ind.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3">
                  {ind.image_url ? (
                    <img src={ind.image_url} alt={ind.label} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-200" />
                  )}
                </td>
                <td className="px-4 py-3 text-gray-900">{ind.label}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{ind.slug}</td>
                <td className="px-4 py-3 text-gray-600">
                  {ind.categories?.length ?? 0}
                </td>
                <td className="px-4 py-3 space-x-3">
                  <Link
                    href={`/admin/industries/${encodeURIComponent(ind.id)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/industries/categories?industry_id=${encodeURIComponent(ind.id)}`}
                    className="text-accent-foreground hover:underline"
                  >
                    View Categories →
                  </Link>
                </td>
              </tr>
            ))}
            {industries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No industries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
